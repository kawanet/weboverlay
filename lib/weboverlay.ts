// weboverlay.ts

import * as express from "express";
import * as http from "http";
import * as https from "https";
import * as morgan from "morgan";

import * as brotli from "express-compress";
import {requestHandler, responseHandler} from "express-intercept";
import {sed} from "express-sed";
import {tee, TeeOptions} from "express-tee";
import {upstream, UpstreamOptions} from "express-upstream";

export interface WebOverlayOptions {
    /**
     * username and password for basic authentication
     */
    basic?: string | string[];
    /**
     * path to directory to cache remote content
     */
    cache?: string;
    /**
     * force compression format
     */
    compress?: string;
    /**
     * prettify JSON response
     */
    json?: number;
    /**
     * content source layers: Local, Remote, and Transform
     */
    layers?: string[];
    /**
     * morgan access log format: `combined`, `dev`, `tiny`, etc.
     */
    log?: string;
    /**
     * `console`-style logging interface
     */
    logger?: { log: (message: string) => void };
    /**
     * port number to listen
     */
    port?: string;
    /**
     * `sed`-style transforms applied for every text contents
     */
    sed?: string;
}

/**
 * Layered Hybrid Web Server: Local, Remote, and Transform
 * @see https://github.com/kawanet/weboverlay
 */

export function weboverlay(options: WebOverlayOptions): express.Express {
    if (!options) options = {} as WebOverlayOptions;
    const {basic, cache, compress, json, log, port} = options;
    const layers = options.layers || [];
    const logger = options.logger || {log: () => null};
    let locals = 0;
    let remotes = 0;
    let transforms = 0;

    const agentOptions: http.AgentOptions = {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
    };

    const upstreamOptions: UpstreamOptions = {
        logger: {log: (mess: string) => logger.log("upstream: " + mess)},
        httpAgent: new http.Agent(agentOptions),
        httpsAgent: new https.Agent(agentOptions),
    };

    const teeOptions: TeeOptions = {
        logger: {log: (mess: string) => logger.log("cache: " + mess)},
    };

    const morganOptions: morgan.Options = {
        stream: {write: (message: string) => logger.log(String(message).replace(/\n+$/, ""))}
    };

    const app = express();

    if (log) {
        app.use(morgan(log, morganOptions));
    }

    /**
     * Basic authentication
     */

    if (basic) {
        const users = {} as { [base64: string]: boolean };
        const list = ("string" === typeof basic) ? [basic] : basic as string[];

        // raw username:password pair
        list.filter(str => str && /:/.test(str))
            .map(str => Buffer.from(str).toString("base64"))
            .forEach(str => users[str] = true);

        // base64 encoded
        list.filter(str => str && !/:/.test(str))
            .forEach(str => users[str] = true);

        logger.log("authentication: Basic");

        app.use(requestHandler().use((req, res, next) => {
            const sent = String(req.headers.authorization).replace(/^basic\s+/i, "");
            delete req.headers.authorization;
            if (users[sent]) return next();
            res.status(401).header("WWW-Authenticate", 'Basic realm="username and password"').end();
        }));
    }

    /**
     * Compression
     */

    if ("string" === typeof compress) {
        logger.log("compress: " + compress);
        app.use(requestHandler().getRequest(req => req.headers["accept-encoding"] = compress));
    }

    app.use(brotli.compress());

    /**
     * HEAD fakes GET
     */

    app.use(requestHandler().for(req => req.method === "HEAD").use(
        requestHandler().getRequest(req => req.method = "GET"),
        responseHandler().getRequest(req => req.method = "HEAD"),
    ));

    /**
     * `sed`-style transform
     */

    if (options.sed) {
        applySed(options.sed);
    }

    /**
     * Layers
     */

    layers.forEach(path => {
        path = path.replace(/^\s+/g, "");
        path = path.replace(/\s+$/g, "");

        // comment
        if (path[0] === "#") {
            return logger.log(path);
        }

        // sed-style transform
        if (path[0] === "s") {
            const delim = path[1];
            if (path.split(delim).length > 3) {
                return applySed(path);
            }
        }

        // @text/html=s=>s.toLowerCase()
        // @text/html=require('jaconv').toHanAscii
        if (path[0] === "@") {
            const type = path.substr(1).split("=").shift();
            const esc = type.replace(/(\W)/g, "\\$1").replace(/\\,/g, "|");
            const re = new RegExp(`^(${esc})`);
            const code = path.substr(type.length + 2);
            logger.log("type: " + re);
            logger.log("function: " + code);
            const fn = eval(code);
            if (!type || "function" !== typeof fn) throw new Error("Invalid function: " + path);
            transforms++;

            return app.use(responseHandler()
                .if(res => re.test(String(res.getHeader("content-type"))))
                .replaceString(str => fn(str)));
        }

        let mount = "/";
        let target: string;

        if (path[0] === "/") {
            const sp = path.split("=");
            if (sp.length === 2) {
                [mount, target] = sp;
            }
        }

        // /path/to/exclude=404
        if (/^[1-5]\d\d$/.test(target)) {
            logger.log("statusCode: " + mount + " => " + target);
            app.use(path, requestHandler().use((req, res) => res.status(+target).send("")));
            return;
        }

        if (locals + remotes === 0 && json >= 0) {
            app.use(responseHandler()
                .if(res => /^application\/json/.test(String(res.getHeader("content-type"))))
                .replaceString(str => JSON.stringify(JSON.parse(str), null, json)));
        }

        // proxy to upstream server
        if (path.search(/^https?:\/\//) === 0) {
            if (!remotes && cache) {
                logger.log("cache: " + cache);
                app.use(express.static(cache));
                app.use(tee(cache, teeOptions));
            }

            if (!remotes && transforms) {
                app.use(brotli.decompress());
            }

            // redirection
            const host = path.split("/")[2];
            app.use(responseHandler()
                .if(res => (res.statusCode === 301 || res.statusCode === 302))
                .getResponse(res => {
                    const location = String(res.getHeader("location"));
                    const destHost = location.split("/")[2];
                    const destPath = location.replace(/^https?:\/\/[^\/]+\/?/, "/");
                    if (destHost === host && destPath !== location) {
                        res.setHeader("location", destPath)
                        logger.log("location: " + destPath);
                    }
                }));

            logger.log("upstream: " + path);
            remotes++;
            return app.use(upstream(path, upstreamOptions));
        }

        // static document root
        if (target == null) target = path;
        logger.log("local: " + mount + " => " + target);
        locals++;
        return app.use(mount, express.static(target));
    });

    if (locals + remotes === 0) {
        throw new Error("No content source applied");
    }

    if (port) {
        app.listen(+port, () => options.logger.log("port: " + port));
    }

    return app;

    // sed-style transform
    function applySed(path: string) {
        const esc = {"\r": "\\r", "\n": "\\n", "\t": "\\t"} as any;
        logger.log("transform: " + path.replace(/([\r\n\t])/g, match => esc[match] || match));
        try {
            const mw = sed(path);
            transforms++;
            return app.use(mw);
        } catch (e) {
            logger.log("transform: " + (e && e.message || e));
            return;
        }
    }
}
