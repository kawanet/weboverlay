// weboverlay.ts

exports.weboverlay = weboverlay;

import * as express from "express";
import * as http from "http";
import * as https from "https";
import * as morgan from "morgan";

import {sed} from "express-sed";
import {tee} from "express-tee";
import {upstream, UpstreamOptions} from "express-upstream";

export interface WebOverlayOptions {
    source: string[];
    log?: string;
    cache?: string;
    port?: string;
}

export function weboverlay(options: WebOverlayOptions): express.Express {
    if (!options) options = {} as WebOverlayOptions;
    const {log, port} = options;
    const sources = options.source || [];
    let cache = options.cache;
    let count = 0;

    const agentOptions: http.AgentOptions = {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
    };

    const upstreamOptions: UpstreamOptions = {
        logger: {log: (mess: string) => console.log("upstream: " + mess)},
        httpAgent: new http.Agent(agentOptions),
        httpsAgent: new https.Agent(agentOptions),
    };

    const app = express();

    if (log) {
        app.use(morgan(log));
    }

    sources.forEach(path => {
        // sed-style transform
        if (path[0] === "s") {
            try {
                const mw = sed(path);
                console.warn("transform: " + path);
                return app.use(mw);
            } catch (e) {
                //
            }
        }

        // proxy to upstream server
        if (path.search(/^https?:\/\//) === 0) {
            if (cache) {
                console.warn("cache: " + cache);
                app.use(express.static(cache));
                app.use(tee(cache));
                cache = null; // cache applied only once
            }

            console.warn("upstream: " + path);
            count++;
            return app.use(upstream(path, upstreamOptions));
        }

        // static document root
        console.warn("local: " + path);
        count++;
        return app.use(express.static(path));
    });

    if (!count) {
        throw new Error("No content source applied");
    }

    if (port) {
        app.listen(port, () => console.warn("port: " + port));
    }

    return app;
}
