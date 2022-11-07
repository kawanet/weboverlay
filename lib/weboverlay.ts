/**
 * https://github.com/kawanet/weboverlay
 */

import * as express from "express";
import type {RequestHandler} from "express";
import * as http from "http";
import * as https from "https";
import * as morgan from "morgan";
import * as serveIndex from "serve-index";
import * as brotli from "express-compress";
import {requestHandler, responseHandler} from "express-intercept";
import {sed} from "express-sed";
import {tee, TeeOptions} from "express-tee";
import {upstream, UpstreamOptions} from "express-upstream";
import {expressCharset} from "express-charset";
import {serveStaticGit} from "serve-static-git";

import type * as types from "../types/weboverlay";
import {Layer} from "./layer";
import {decodeBuffer, encodeBuffer} from "./charset";
import {fileLogger} from "./logfile";
import {etagHandler} from "./etag";

const enum HTTP {
    Unauthorized = 401,
}

/**
 * Layered Hybrid Web Server: local files, upstream proxy and content transform
 * @see https://github.com/kawanet/weboverlay
 */

export const weboverlay: typeof types.weboverlay = options => {
    const {basic, cache, compress, index, json, layers, log, logfile, port} = options;

    const logger = logfile ? fileLogger(logfile) : (options.logger || console);
    let localCount = 0;
    let remoteCount = 0;
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

    // 301 Moved Permanently
    // 302 Found
    // 303 See Other
    // 307 Temporary Redirect
    const redirectStatus = /301|302|303|307/;

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

    app.use(morgan(log || "tiny", morganOptions) as RequestHandler);

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
            res.status(HTTP.Unauthorized).header("WWW-Authenticate", 'Basic realm="username and password"').end();
        }));
    }

    /**
     * ETag:
     */
    app.use(etagHandler());

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
     * prettify JSON response
     */

    if (json) {
        app.use(responseHandler()
            .if(res => /^application\/json/.test(String(res.getHeader("content-type"))))
            .replaceString(str => JSON.stringify(JSON.parse(String(str).replace(/^\uFEFF+/, "")), null, json)));
    }

    /**
     * Transforms
     */

    const transformHook = express.Router();
    app.use(transformHook);

    /**
     * Layers
     */

    layers?.forEach(str => {
        const layer = Layer.from(str);

        // empty
        if (layer.match(/^$/)) return;

        // comment
        if (layer.match(/^#/)) {
            return logger.log(layer.def);
        }

        // s/regexp/replacement/g
        if (layer.match(/^s/) && layer.def.split(layer.def[1]).length > 3) {
            const esc = {"\r": "\\r", "\n": "\\n", "\t": "\\t"} as any;
            logger.log("transform: " + layer.toString().replace(/([\r\n\t])/g, match => esc[match] || match));
            return prependTransform(layer.handler(sed(layer.def)));
        }

        // html(s => s.toLowerCase())
        // text(require('jaconv').toHanAscii)
        if (layer.match(/^\w.*\(.+\)$/)) {
            logger.log("function: " + layer);
            return prependTransform(layer.handler(parseFunction(layer.def)));
        }

        // (req,res,next) => res.send("...")
        if (layer.match(/^\(.+\)$/)) {
            logger.log("middleware: " + layer);
            localCount++;
            const fn = eval(layer.def);
            const args = fn?.length;
            if ("function" !== typeof fn && 2 <= args && args <= 4) {
                throw new Error("Invalid middleware: " + layer.def);
            }
            app.use(layer.handler(fn));
            return;
        }

        // /path/to/exclude=404
        if (layer.match(/^[1-5]\d\d$/)) {
            logger.log("status: " + layer);
            localCount++;
            const status = +layer.def;
            app.use(layer.handler((_, res) => res.status(status).send("")));
            return;
        }

        // proxy to upstream server
        if (layer.match(/^https?:\/\//)) {
            if (!+remoteCount) beforeUpstream();
            logger.log("upstream: " + layer);
            app.use(layer.handler(redirection(layer.def)));
            app.use(layer.handler(upstream(layer.def, upstreamOptions)));
            remoteCount++;
            return;
        }

        // git
        if (layer.match(/\.git:/)) {
            logger.log("git: " + layer);
            localCount++;
            const repo = layer.def.replace(/:.*$/, "")
            const root = layer.def.replace(/^.*:/, "").replace(/\/*$/, "/")
            app.use(layer.handler(serveStaticGit({repo, root})));
            return;
        }

        // static document root
        logger.log("local: " + layer);
        localCount++;
        app.use(layer.handler(express.static(layer.def)));

        // directory listing for local files
        if (index) {
            const indexOptions: serveIndex.Options = ("object" === typeof index) ? index : null;
            app.use(layer.handler(serveIndex(layer.def, indexOptions)));
            // logger.log("index: " + layer);
        }
    });

    if (localCount + remoteCount === 0) {
        throw new Error("No content source applied");
    }

    // insert transforms before contents sources
    if (transforms) {
        transformHook.use(encodeBuffer);
        transformHook.use(transforms);
        transformHook.use(decodeBuffer);
        transformHook.use(expressCharset());
    }

    if (port) {
        app.listen(+port, () => logger.log("port: " + port));
    }

    return app;

    /**
     * Insert a response transform handler in reversed order
     */

    function prependTransform(handler: RequestHandler): void {
        transforms = transforms ? requestHandler().use(handler, transforms) : handler;
    }

    // html(s => s.toLowerCase())
    // text(require('jaconv').toHanAscii)
    function parseFunction(func: string): RequestHandler {
        const type = func.replace(/\(.*$/, "");
        const esc = type.replace(/(\W)/g, "\\$1");
        const re = new RegExp("(^|\\W)" + esc + "(\\W|$)", "i");
        const code = func.replace(/^[^(]+/, "");
        const fn = eval(code);
        if (!type || "function" !== typeof fn) throw new Error("Invalid function: " + func);

        return responseHandler()
            .if(res => re.test(String(res.getHeader("content-type"))))
            .replaceString(str => fn(str));
    }

    // apply cache and decompression before first upstream connection
    function beforeUpstream() {
        if (cache) {
            const cacheDir = cache.replace(/[^\/]+\/\.\.\//g, "") || ".";
            logger.log("cache: " + cacheDir);
            app.use(express.static(cacheDir));
            app.use(tee(cacheDir, teeOptions));
        }

        if (cache || transforms || compress) {
            app.use(brotli.decompress());
        }
    }

    // redirection
    function redirection(remote: string): RequestHandler {
        const host = remote.split("/")[2];

        return responseHandler()
            .if(res => redirectStatus.test(String(res.statusCode)))
            .getResponse(res => {
                const location = String(res.getHeader("location"));
                const destHost = location.split("/")[2];
                const destPath = location.replace(/^https?:\/\/[^\/]+\/?/, "/");
                if (destHost === host && destPath !== location) {
                    res.setHeader("location", destPath)
                    logger.log("location: " + destPath);
                }
            });
    }
}
