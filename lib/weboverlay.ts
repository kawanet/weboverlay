// weboverlay.ts

import * as express from "express";
import {RequestHandler} from "express";
import * as http from "http";
import * as https from "https";
import * as morgan from "morgan";
import * as serveIndex from "serve-index";

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
     * directory listing for local files (default: disabled)
     */
    index?: boolean | any;
    /**
     * prettify JSON response
     */
    json?: number;
    /**
     * content source layers: local path, upstream proxy and content transform
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
 * Layered Hybrid Web Server: local files, upstream proxy and content transform
 * @see https://github.com/kawanet/weboverlay
 */

export function weboverlay(options: WebOverlayOptions): express.Express {
    if (!options) options = {} as WebOverlayOptions;
    const {basic, cache, compress, json, log, port} = options;
    const layers = options.layers || [];
    const logger = options.logger || console;
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

    layers.forEach(str => {
        const layer = new Layer(str);

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
            return addTransform(layer, sed(layer.def));
        }

        // html(s => s.toLowerCase())
        // text(require('jaconv').toHanAscii)
        if (layer.match(/^\w.*\(.+\)$/)) {
            logger.log("function: " + layer);
            return addTransform(layer, parseFunction(layer, layer.def));
        }

        // /path/to/exclude=404
        if (layer.match(/^[1-5]\d\d$/)) {
            logger.log("status: " + layer);
            const status = +layer.def;
            app.use(layer.path, layer.handler((req, res) => res.status(status).send("")));
            return;
        }

        // proxy to upstream server
        if (layer.match(/^https?:\/\//)) {
            if (!+remoteCount) beforeUpstream();
            logger.log("upstream: " + layer);
            useUpstream(layer, layer.def);
            remoteCount++;
            return;
        }

        // static document root
        logger.log("local: " + layer);
        localCount++;
        app.use(layer.path, layer.handler(express.static(layer.def)));

        // directory listing for local files
        if (options.index) {
            const indexOptions: serveIndex.Options = ("object" === typeof options.index) ? options.index : null;
            app.use(layer.path, layer.handler(serveIndex(layer.def, indexOptions)));
            // logger.log("index: " + layer);
        }
    });

    if (localCount + remoteCount === 0) {
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

    function addTransform(mount: Layer, handler: RequestHandler) {
        // wrap with .use() if mount path is specified other than root
        if (mount.path !== "/") {
            handler = express.Router().use(mount.path, handler);
        }

        handler = mount.handler(handler);

        // insert the handler at the first
        transforms = transforms ? requestHandler().use(handler, transforms) : handler;
    }

    // html(s => s.toLowerCase())
    // text(require('jaconv').toHanAscii)
    function parseFunction(layer: Layer, func: string) {
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
            const cacheDir = cache.replace(/[^\.\/]+\/\.\.\//g, "") || ".";
            logger.log("cache: " + cacheDir);
            app.use(express.static(cacheDir));
            app.use(tee(cacheDir, teeOptions));
        }

        if (transforms || compress) {
            app.use(brotli.decompress());
        }
    }

    // proxy to upstream server
    function useUpstream(layer: Layer, remote: string) {
        // redirection
        const host = remote.split("/")[2];
        app.use(layer.handler(responseHandler()
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
        return app.use(layer.path, layer.handler(upstream(remote, upstreamOptions)));
    }
}

class Layer {
    host: string;
    path: string = "/";
    def: string;

    constructor(layer: string) {
        layer = layer.replace(/^\s+/g, "");
        layer = layer.replace(/\s+$/g, "");

        // /alias/ = local/path - partial mount alias
        if (/^\/.*=/.test(layer)) {
            let path = layer.replace(/\s*=.*$/, "");
            layer = layer.replace(/^.*?=\s*/, "");

            // //virtual.host.name/ = htdocs - name based virtual host to mount
            // //proxy.host.name/ = https://upstream.host - name based virtual host to proxy
            if (/^\/\/[^\/]+\//.test(path)) {
                this.host = path.split("/")[2];
                path = path.replace(/^\/\/[^\/]+/, "");
            }

            this.path = path;
        }

        this.def = layer;
    }

    match(re: RegExp) {
        return re.test(this.def);
    }

    handler(handler: RequestHandler) {
        if (this.host) {
            handler = requestHandler().for(req => req.headers.host === this.host).use(handler);
        }

        return handler;
    }

    toString() {
        const mount = this.host ? ("//" + this.host + this.path) : this.path;
        return mount + " = " + this.def;
    }
}
