"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weboverlay = void 0;
const express = require("express");
const http = require("http");
const https = require("https");
const morgan = require("morgan");
const async_request_handler_1 = require("async-request-handler");
const brotli = require("express-compress");
const express_intercept_1 = require("express-intercept");
const express_sed_1 = require("express-sed");
const express_tee_1 = require("express-tee");
const express_upstream_1 = require("express-upstream");
function weboverlay(options) {
    if (!options)
        options = {};
    const { basic, cache, compress, json, log, port } = options;
    const layers = options.layers || [];
    const logger = options.logger || console;
    let localCount = 0;
    let remoteCount = 0;
    let transforms;
    const agentOptions = {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
    };
    const upstreamOptions = {
        logger: { log: (mess) => logger.log("upstream: " + mess) },
        httpAgent: new http.Agent(agentOptions),
        httpsAgent: new https.Agent(agentOptions),
        ignoreStatus: /404/,
    };
    const teeOptions = {
        logger: { log: (mess) => logger.log("cache: " + mess) },
    };
    const morganOptions = {
        stream: { write: (message) => logger.log(String(message).replace(/\n+$/, "")) }
    };
    const app = express();
    app.use(morgan(log || "tiny", morganOptions));
    if (basic) {
        const users = {};
        const list = ("string" === typeof basic) ? [basic] : basic;
        list.filter(str => str && /:/.test(str))
            .map(str => Buffer.from(str).toString("base64"))
            .forEach(str => users[str] = true);
        list.filter(str => str && !/:/.test(str))
            .forEach(str => users[str] = true);
        logger.log("authentication: Basic");
        app.use(express_intercept_1.requestHandler().use((req, res, next) => {
            const sent = String(req.headers.authorization).replace(/^basic\s+/i, "");
            delete req.headers.authorization;
            if (users[sent])
                return next();
            res.status(401).header("WWW-Authenticate", 'Basic realm="username and password"').end();
        }));
    }
    if ("string" === typeof compress) {
        logger.log("compress: " + compress);
        app.use(express_intercept_1.requestHandler().getRequest(req => req.headers["accept-encoding"] = compress));
    }
    app.use(brotli.compress());
    app.use(express_intercept_1.requestHandler().for(req => req.method === "HEAD").use(express_intercept_1.requestHandler().getRequest(req => req.method = "GET"), express_intercept_1.responseHandler().getRequest(req => req.method = "HEAD")));
    const transformHook = express.Router();
    app.use(transformHook);
    if (json >= 0) {
        app.use(express_intercept_1.responseHandler()
            .if(res => /^application\/json/.test(String(res.getHeader("content-type"))))
            .replaceString(str => JSON.stringify(JSON.parse(String(str).replace(/^\uFEFF+/, "")), null, json)));
    }
    layers.forEach(layer => {
        layer = layer.replace(/^\s+/g, "");
        layer = layer.replace(/\s+$/g, "");
        const mount = new MountPosition();
        if (/^\/.*=/.test(layer)) {
            let alias = layer.replace(/\s*=.*$/, "");
            layer = layer.replace(/^.*?=\s*/, "");
            if (/^\/\/[^\/]+\//.test(alias)) {
                mount.host = alias.split("/")[2];
                alias = alias.replace(/^\/\/[^\/]+/, "");
            }
            mount.path = alias;
        }
        if (layer[0] === "#") {
            return logger.log(layer);
        }
        if (layer[0] === "s" && layer.split(layer[1]).length > 3) {
            const esc = { "\r": "\\r", "\n": "\\n", "\t": "\\t" };
            logger.log("transform: " + mount + " => " + layer.replace(/([\r\n\t])/g, match => esc[match] || match));
            return addTransform(mount, express_sed_1.sed(layer));
        }
        if (/^\w.*\(.+\)$/.test(layer)) {
            return addTransform(mount, wrapFunction(mount, layer));
        }
        if (/^[1-5]\d\d$/.test(layer)) {
            logger.log("status: " + mount + " => " + layer);
            const handler = express_intercept_1.requestHandler().use((req, res) => res.status(+layer).send(""));
            app.use(mount.path, wrapHandler(mount, handler));
            return;
        }
        if (layer.search(/^https?:\/\//) === 0) {
            if (!+remoteCount)
                beforeUpstream();
            useUpstream(mount, layer);
            remoteCount++;
            return;
        }
        logger.log("local: " + mount + " => " + layer);
        localCount++;
        return app.use(mount.path, wrapHandler(mount, express.static(layer)));
    });
    if (localCount + remoteCount === 0) {
        throw new Error("No content source applied");
    }
    if (transforms) {
        transformHook.use(transforms);
    }
    if (port) {
        app.listen(+port, () => logger.log("port: " + port));
    }
    return app;
    function addTransform(mount, handler) {
        if (mount.path !== "/") {
            handler = express.Router().use(mount.path, handler);
        }
        handler = wrapHandler(mount, handler);
        transforms = transforms ? async_request_handler_1.ASYNC(handler, transforms) : handler;
    }
    function wrapHandler(mount, handler) {
        if (mount.host) {
            handler = express_intercept_1.requestHandler().for(req => req.headers.host === mount.host).use(handler);
        }
        return handler;
    }
    function wrapFunction(mount, func) {
        const type = func.replace(/\(.*$/, "");
        const esc = type.replace(/(\W)/g, "\\$1");
        const re = new RegExp("(^|\\W)" + esc + "(\\W|$)", "i");
        const code = func.replace(/^[^(]+/, "");
        logger.log("function: " + mount + " => " + type + " " + code);
        const fn = eval(code);
        if (!type || "function" !== typeof fn)
            throw new Error("Invalid function: " + func);
        return express_intercept_1.responseHandler()
            .if(res => re.test(String(res.getHeader("content-type"))))
            .replaceString(str => fn(str));
    }
    function beforeUpstream() {
        if (cache) {
            const cacheDir = cache.replace(/[^\.\/]+\/\.\.\//g, "") || ".";
            logger.log("cache: " + cacheDir);
            app.use(express.static(cacheDir));
            app.use(express_tee_1.tee(cacheDir, teeOptions));
        }
        if (transforms || compress) {
            app.use(brotli.decompress());
        }
    }
    function useUpstream(mount, remote) {
        const host = remote.split("/")[2];
        app.use(wrapHandler(mount, express_intercept_1.responseHandler()
            .if(res => (res.statusCode === 301 || res.statusCode === 302))
            .getResponse(res => {
            const location = String(res.getHeader("location"));
            const destHost = location.split("/")[2];
            const destPath = location.replace(/^https?:\/\/[^\/]+\/?/, "/");
            if (destHost === host && destPath !== location) {
                res.setHeader("location", destPath);
                logger.log("location: " + destPath);
            }
        })));
        logger.log("upstream: " + remote);
        return app.use(mount.path, wrapHandler(mount, express_upstream_1.upstream(remote, upstreamOptions)));
    }
}
exports.weboverlay = weboverlay;
class MountPosition {
    constructor() {
        this.path = "/";
    }
    toString() {
        return this.host ? this.host + this.path : this.path;
    }
}
