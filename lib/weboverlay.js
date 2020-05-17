"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const http = require("http");
const https = require("https");
const morgan = require("morgan");
const brotli = require("express-compress");
const express_intercept_1 = require("express-intercept");
const express_sed_1 = require("express-sed");
const express_tee_1 = require("express-tee");
const express_upstream_1 = require("express-upstream");
function weboverlay(options) {
    if (!options)
        options = {};
    const { basic, cache, compress, json, log } = options;
    const layers = options.layers || [];
    const logger = options.logger || { log: () => null };
    let locals = 0;
    let remotes = 0;
    let transforms = 0;
    const agentOptions = {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
    };
    const upstreamOptions = {
        logger: { log: (mess) => logger.log("upstream: " + mess) },
        httpAgent: new http.Agent(agentOptions),
        httpsAgent: new https.Agent(agentOptions),
    };
    const teeOptions = {
        logger: { log: (mess) => logger.log("cache: " + mess) },
    };
    const morganOptions = {
        stream: { write: (message) => logger.log(String(message).replace(/\n+$/, "")) }
    };
    const app = express();
    if (log) {
        app.use(morgan(log, morganOptions));
    }
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
    layers.forEach(path => {
        path = path.replace(/^\s+/g, "");
        path = path.replace(/\s+$/g, "");
        if (path[0] === "#") {
            return logger.log(path);
        }
        if (path[0] === "s") {
            const delim = path[1];
            if (path.split(delim).length > 3) {
                const esc = { "\r": "\\r", "\n": "\\n", "\t": "\\t" };
                logger.log("transform: " + path.replace(/([\r\n\t])/g, match => esc[match] || match));
                try {
                    const mw = express_sed_1.sed(path);
                    transforms++;
                    return app.use(mw);
                }
                catch (e) {
                    logger.log("transform: " + (e && e.message || e));
                    return;
                }
            }
        }
        if (path[0] === "@") {
            const type = path.substr(1).split("=").shift();
            const esc = type.replace(/(\W)/g, "\\$1").replace(/\\,/g, "|");
            const re = new RegExp(`^(${esc})`);
            const code = path.substr(type.length + 2);
            logger.log("type: " + re);
            logger.log("function: " + code);
            const fn = eval(code);
            if (!type || "function" !== typeof fn)
                throw new Error("Invalid function: " + path);
            transforms++;
            return app.use(express_intercept_1.responseHandler()
                .if(res => re.test(String(res.getHeader("content-type"))))
                .replaceString(str => fn(str)));
        }
        let mount = "/";
        let target;
        if (path[0] === "/") {
            const sp = path.split("=");
            if (sp.length === 2) {
                [mount, target] = sp;
            }
        }
        if (/^[1-5]\d\d$/.test(target)) {
            logger.log("statusCode: " + mount + " => " + target);
            app.use(path, express_intercept_1.requestHandler().use((req, res) => res.status(+target).send("")));
            return;
        }
        if (locals + remotes === 0 && json >= 0) {
            app.use(express_intercept_1.responseHandler()
                .if(res => /^application\/json/.test(String(res.getHeader("content-type"))))
                .replaceString(str => JSON.stringify(JSON.parse(str), null, json)));
        }
        if (path.search(/^https?:\/\//) === 0) {
            if (!remotes && cache) {
                logger.log("cache: " + cache);
                app.use(express.static(cache));
                app.use(express_tee_1.tee(cache, teeOptions));
            }
            if (!remotes && transforms) {
                app.use(brotli.decompress());
            }
            const host = path.split("/")[2];
            app.use(express_intercept_1.responseHandler()
                .if(res => (res.statusCode === 301 || res.statusCode === 302))
                .getResponse(res => {
                const location = String(res.getHeader("location"));
                const destHost = location.split("/")[2];
                const destPath = location.replace(/^https?:\/\/[^\/]+\/?/, "/");
                if (destHost === host && destPath !== location) {
                    res.setHeader("location", destPath);
                    logger.log("location: " + destPath);
                }
            }));
            logger.log("upstream: " + path);
            remotes++;
            return app.use(express_upstream_1.upstream(path, upstreamOptions));
        }
        if (target == null)
            target = path;
        logger.log("local: " + mount + " => " + target);
        locals++;
        return app.use(mount, express.static(target));
    });
    if (locals + remotes === 0) {
        throw new Error("No content source applied");
    }
    return app;
}
exports.weboverlay = weboverlay;
