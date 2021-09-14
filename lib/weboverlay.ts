// weboverlay.ts

import * as express from "express";
import {RequestHandler, Router} from "express";
import * as http from "http";
import * as https from "https";
import * as morgan from "morgan";
import * as serveIndex from "serve-index";
import * as brotli from "express-compress";
import {requestHandler, responseHandler} from "express-intercept";
import {sed} from "express-sed";
import {tee, TeeOptions} from "express-tee";
import {upstream, UpstreamOptions} from "express-upstream";
import * as iconv from "iconv-lite";

import {WebOverlayOptions} from "../";

const enum HTTP {
    Unauthorized = 401,
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
            res.status(HTTP.Unauthorized).header("WWW-Authenticate", 'Basic realm="username and password"').end();
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

    const transformHook = Router();
    app.use(transformHook);

    /**
     * Layers
     */

    layers.forEach(str => {
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

        // static document root
        logger.log("local: " + layer);
        localCount++;
        app.use(layer.handler(express.static(layer.def)));

        // directory listing for local files
        if (options.index) {
            const indexOptions: serveIndex.Options = ("object" === typeof options.index) ? options.index : null;
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
        transformHook.use(detectXmlEncoding);
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
            const cacheDir = cache.replace(/[^\.\/]+\/\.\.\//g, "") || ".";
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

type MicroRes = { getHeader: (key: string) => any };
const getContentType = (res: MicroRes) => String(res.getHeader("content-type"));
const testContentType = (res: MicroRes, re: RegExp) => re.test(getContentType(res));
const getCharset = (str: string) => str.split(/^.*?\Wcharset=["']?([^"']+)/)[1];
const getEncoding = (str: string) => str.split(/^.*?\Wencoding=["']?([^"']+)/)[1];

/**
 * encode response buffer from UTF-8 to given charset
 */

const encodeBuffer = responseHandler()
    .if(res => testContentType(res, /^(text|application)\//))
    .if(res => testContentType(res, /\Wcharset=/))
    .replaceBuffer((buf, _, res) => {
        const charset = getCharset(getContentType(res));
        if (charset && !/^utf-8/i.test(charset)) {
            buf = iconv.encode(buf.toString(), charset);
        }
        return buf;
    });

/**
 * decode response buffer from given charset to UTF-8
 */

const decodeBuffer = responseHandler()
    .if(res => testContentType(res, /^(text|application)\//))
    .if(res => testContentType(res, /\Wcharset=/))
    .replaceBuffer((buf, _, res) => {
        const charset = getCharset(getContentType(res));
        if (charset && !/^utf-8/i.test(charset)) {
            buf = Buffer.from(iconv.decode(buf, charset));
        }
        return buf;
    });

/**
 * auto detect XML encoding
 */

const detectXmlEncoding = responseHandler()
    .if(res => testContentType(res, /\Wxml(\W|$)/))
    .if(res => !testContentType(res, /\Wcharset=/))
    .getBuffer((buf, _, res) => {
        const length = Math.min(buf.length, 2000);
        let str = "";
        for (let i = 0; i < length; i++) {
            const c = buf[i];
            if (i > 0x7F) break; // non US-ASCII
            str += String.fromCharCode(c);
            if (i === 0x3E) break; // >
        }
        const type = getContentType(res);
        const encoding = getEncoding(str);
        res.setHeader("content-type", `${type}; charset=${encoding}`);
    });

class Layer {
    private host: string;
    private path: string;
    private regexp: RegExp;
    def: string;

    static from(def: string) {
        def = def.replace(/^\s+/g, "");
        def = def.replace(/\s+$/g, "");

        const layer = new Layer();

        // /alias/ = local/path - partial mount alias
        if (/^[\/^].*=/.test(def)) {
            const path = def.replace(/\s*=.*$/, ""); // before =
            def = def.replace(/^.*?=\s*/, ""); // after =

            // //virtual.host.name/ = htdocs - name based virtual host to mount
            // //proxy.host.name/ = https://upstream.host - name based virtual host to proxy
            if (/^\/\/[^\/]+\//.test(path)) {
                layer.host = path.split("/")[2];
                layer.path = path.replace(/^\/\/[^\/]+/, "");

            } else if (/^\^/.test(path)) {
                // ^/regexp/ = def
                layer.regexp = new RegExp(path);

            } else {
                // /normal/path/ = def
                layer.path = path;
            }
        }

        layer.def = def;
        return layer;
    }

    match(re: RegExp) {
        return re.test(this.def);
    }

    handler(handler: RequestHandler) {
        // wrap with requestHandler to enable Named Virtual Hosts
        if (this.host) {
            handler = requestHandler().for(req => req.headers.host === this.host).use(handler);
        }

        if (this.regexp) {
            handler = requestHandler().for(req => this.regexp.test(req.path)).use(handler);
        }

        // wrap with .use() if mount path is specified other than root
        if (this.path) {
            handler = Router().use(this.path, handler);
        }

        return handler;
    }

    toString() {
        let {host, path, regexp, def} = this;
        host = host ? "//" + host : "";
        if (!path && !regexp) path = "/";
        if (!path && regexp) path = String(regexp).replace(/^\/|\/$/sg, "");
        if (!def) def = "";
        return `${host}${path} = ${def}`;
    }
}
