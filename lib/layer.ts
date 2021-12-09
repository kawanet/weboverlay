/**
 * https://github.com/kawanet/weboverlay
 */

import {RequestHandler, Router} from "express";
import {requestHandler} from "express-intercept";

export class Layer {
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
