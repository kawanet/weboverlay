// weboverlay.ts

import {requestHandler, responseHandler} from "express-intercept";

exports.weboverlay = weboverlay;

import * as express from "express";
import * as http from "http";
import * as https from "https";
import * as morgan from "morgan";

import {sed} from "express-sed";
import {tee, TeeOptions} from "express-tee";
import {upstream, UpstreamOptions} from "../../express-upstream";

export interface WebOverlayOptions {
    basic?: string | string[];
    cache?: string;
    json?: number;
    layers?: string[];
    log?: string;
    logger?: { log: (message: string) => void };
    port?: string;
}

export function weboverlay(options: WebOverlayOptions): express.Express {
    if (!options) options = {} as WebOverlayOptions;
    const {basic, log, port} = options;
    const layers = options.layers || [];
    const logger = options.logger || {log: () => null};
    let cache = options.cache;
    let count = 0;

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

    const app = express();

    if (log) {
        app.use(morgan(log));
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

    layers.forEach(path => {
        path = path.replace(/^\s+/g, "");
        path = path.replace(/\s+$/g, "");

        // comment
        if (path[0] === "#") {
            return logger.log(path);
        }

        // sed-style transform
        if (path[0] === "s") {
            try {
                const mw = sed(path);
                logger.log("transform: " + path);
                return app.use(mw);
            } catch (e) {
                //
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

            return app.use(responseHandler()
                .if(res => re.test(String(res.getHeader("content-type"))))
                .replaceString(str => fn(str)));
        }

        if (!count && options.json >= 0) {
            app.use(responseHandler()
                .if(res => /^application\/json/.test(String(res.getHeader("content-type"))))
                .replaceString(str => JSON.stringify(JSON.parse(str), null, options.json)));
        }

        // proxy to upstream server
        if (path.search(/^https?:\/\//) === 0) {
            if (cache) {
                logger.log("cache: " + cache);
                app.use(express.static(cache));
                app.use(tee(cache, teeOptions));
                cache = null; // cache applied only once
            }

            logger.log("upstream: " + path);
            count++;
            return app.use(upstream(path, upstreamOptions));
        }

        // static document root
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
