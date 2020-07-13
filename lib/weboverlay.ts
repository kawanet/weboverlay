// weboverlay.ts

import * as express from "express";
import {RequestHandler} from "express";
import * as http from "http";
import * as https from "https";
import * as morgan from "morgan";

import {ASYNC} from "async-request-handler";
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
     * access log format: `combined`, `dev`, etc. (default: `tiny`)
     * @see https://www.npmjs.com/package/morgan
     */
    log?: string;
    /**
     * logging interface (default: `console`)
     */
    logger?: { log: (message: string) => void };
    /**
     * port number to listen
     */
    port?: string;
}

/**
 * Layered Hybrid Web Server: Local, Remote, and Transform
 * @see https://github.com/kawanet/weboverlay
 */

export function weboverlay(options: WebOverlayOptions): express.Express {
    if (!options) options = {} as WebOverlayOptions;
    const {basic, cache, compress, json, log, port} = options;
    const layers = options.layers || [];
    const logger = options.logger || console;
    let locals = 0;
    let remotes = 0;
    let transforms: RequestHandler;

    const agentOptions: http.AgentOptions = {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
    };

    const upstreamOptions: UpstreamOptions = {
        logger: {log: (mess: string) => logger.log("upstream: " + mess)},
        httpAgent: new http.Agent(agentOptions),
        httpsAgent: new https.Agent(agentOptions),
        ignoreStatus: /404/,
    };

    const teeOptions: TeeOptions = {
        logger: {log: (mess: string) => logger.log("cache: " + mess)},
    };

    const morganOptions: { stream: morgan.StreamOptions } = {
        stream: {write: (message: string) => logger.log(String(message).replace(/\n+$/, ""))}
    };

    const app = express();

    /**
     * Access logging
     */

    app.use(morgan(log || "tiny", morganOptions));

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
     * Transforms
     */

    const transformHook = express.Router();
    app.use(transformHook);

    /**
     * prettify JSON response
     */

    if (json >= 0) {
        app.use(responseHandler()
            .if(res => /^application\/json/.test(String(res.getHeader("content-type"))))
            .replaceString(str => JSON.stringify(JSON.parse(String(str).replace(/^\uFEFF+/, "")), null, json)));
    }

    /**
     * Layers
     */

    layers.forEach(path => {
        path = path.replace(/^\s+/g, "");
        path = path.replace(/\s+$/g, "");

        const mount = new MountPosition();

        // /alias/ = local/path - partial mount alias
        if (/^\/.*=/.test(path)) {
            let alias = path.replace(/\s*=.*$/, "");
            path = path.replace(/^.*?=\s*/, "");

            // //virtual.host.name/ = htdocs - name based virtual host to mount
            // //proxy.host.name/ = https://upstream.host - name based virtual host to proxy
            if (/^\/\/[^\/]+\//.test(alias)) {
                mount.host = alias.split("/")[2];
                alias = alias.replace(/^\/\/[^\/]+/, "");
            }

            mount.path = alias;
        }

        // comment
        if (path[0] === "#") {
            return logger.log(path);
        }

        // s/regexp/replacement/g
        if (path[0] === "s" && path.split(path[1]).length > 3) {
            const esc = {"\r": "\\r", "\n": "\\n", "\t": "\\t"} as any;
            logger.log("transform: " + mount + " => " + path.replace(/([\r\n\t])/g, match => esc[match] || match));
            return addTransform(mount, sed(path));
        }

        // html(s=>s.toLowerCase())
        // text(require('jaconv').toHanAscii)
        if (/^\w.*\(.+\)$/.test(path)) {
            return addTransform(mount, wrapFunction(mount, path));
        }

        // /path/to/exclude=404
        if (/^[1-5]\d\d$/.test(path)) {
            logger.log("status: " + mount + " => " + path);
            const handler = requestHandler().use((req, res) => res.status(+path).send(""));
            app.use(mount.path, wrapHandler(mount, handler));
            return;
        }

        // proxy to upstream server
        if (path.search(/^https?:\/\//) === 0) {
            if (!+remotes) beforeUpstream();
            useUpstream(mount, path);
            remotes++;
            return;
        }

        // static document root
        logger.log("local: " + mount + " => " + path);
        locals++;
        return app.use(mount.path, wrapHandler(mount, express.static(path)));
    });

    if (locals + remotes === 0) {
        throw new Error("No content source applied");
    }

    // insert transforms before contents sources
    if (transforms) {
        transformHook.use(transforms);
    }

    if (port) {
        app.listen(+port, () => logger.log("port: " + port));
    }

    return app;

    function addTransform(mount: MountPosition, handler: RequestHandler) {
        // wrap with .use() if mount path is specified other than root
        if (mount.path !== "/") {
            handler = express.Router().use(mount.path, handler);
        }

        handler = wrapHandler(mount, handler);

        // insert the handler at the first
        transforms = transforms ? ASYNC(handler, transforms) : handler;
    }

    function wrapHandler(mount: MountPosition, handler: RequestHandler) {
        if (mount.host) {
            handler = requestHandler().for(req => req.hostname === mount.host).use(handler);
        }

        return handler;
    }

    // html(s=>s.toLowerCase())
    // text(require('jaconv').toHanAscii)
    function wrapFunction(mount: MountPosition, path: string) {
        const type = path.replace(/\(.*$/, "");
        const esc = type.replace(/(\W)/g, "\\$1");
        const re = new RegExp("(^|\\W)" + esc + "(\\W|$)", "i");
        const code = path.replace(/^[^(]+/, "");
        logger.log("function: " + mount.path + " => " + type + " " + code);
        const fn = eval(code);
        if (!type || "function" !== typeof fn) throw new Error("Invalid function: " + path);

        return responseHandler()
            .if(res => re.test(String(res.getHeader("content-type"))))
            .replaceString(str => fn(str));
    }

    // apply cache and decompression before first upstream connection
    function beforeUpstream() {
        if (!remotes && cache) {
            const cacheDir = cache.replace(/[^\.\/]+\/\.\.\//g, "") || ".";
            logger.log("cache: " + cacheDir);
            app.use(express.static(cacheDir));
            app.use(tee(cacheDir, teeOptions));
        }

        if (!remotes && (transforms || compress)) {
            app.use(brotli.decompress());
        }
    }

    // proxy to upstream server
    function useUpstream(mount: MountPosition, path: string) {
        // redirection
        const host = path.split("/")[2];
        app.use(wrapHandler(mount, responseHandler()
            .if(res => (res.statusCode === 301 || res.statusCode === 302))
            .getResponse(res => {
                const location = String(res.getHeader("location"));
                const destHost = location.split("/")[2];
                const destPath = location.replace(/^https?:\/\/[^\/]+\/?/, "/");
                if (destHost === host && destPath !== location) {
                    res.setHeader("location", destPath)
                    logger.log("location: " + destPath);
                }
            })));

        // origin
        logger.log("upstream: " + path);
        return app.use(mount.path, wrapHandler(mount, upstream(path, upstreamOptions)));
    }
}

class MountPosition {
    host: string;
    path: string = "/";
}
