"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_intercept_1 = require("express-intercept");
exports.weboverlay = weboverlay;
const express = require("express");
const http = require("http");
const https = require("https");
const morgan = require("morgan");
const express_sed_1 = require("express-sed");
const express_tee_1 = require("express-tee");
const express_upstream_1 = require("../../express-upstream");
function weboverlay(options) {
    if (!options)
        options = {};
    const { basic, log, port } = options;
    const layers = options.layers || [];
    const logger = options.logger || { log: () => null };
    let cache = options.cache;
    let count = 0;
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
    const app = express();
    if (log) {
        app.use(morgan(log));
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
    layers.forEach(path => {
        path = path.replace(/^\s+/g, "");
        path = path.replace(/\s+$/g, "");
        if (path[0] === "#") {
            return logger.log(path);
        }
        if (path[0] === "s") {
            try {
                const mw = express_sed_1.sed(path);
                logger.log("transform: " + path);
                return app.use(mw);
            }
            catch (e) {
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
            return app.use(express_intercept_1.responseHandler()
                .if(res => re.test(String(res.getHeader("content-type"))))
                .replaceString(str => fn(str)));
        }
        if (!count && options.json >= 0) {
            app.use(express_intercept_1.responseHandler()
                .if(res => /^application\/json/.test(String(res.getHeader("content-type"))))
                .replaceString(str => JSON.stringify(JSON.parse(str), null, options.json)));
        }
        if (path.search(/^https?:\/\//) === 0) {
            if (cache) {
                logger.log("cache: " + cache);
                app.use(express.static(cache));
                app.use(express_tee_1.tee(cache, teeOptions));
                cache = null;
            }
            logger.log("upstream: " + path);
            count++;
            return app.use(express_upstream_1.upstream(path, upstreamOptions));
        }
        logger.log("local: " + path);
        count++;
        return app.use(express.static(path));
    });
    if (!count) {
        throw new Error("No content source applied");
    }
    if (port) {
        app.listen(port, () => logger.log("port: " + port));
    }
    return app;
}
exports.weboverlay = weboverlay;
