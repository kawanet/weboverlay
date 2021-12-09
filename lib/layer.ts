/**
 * https://github.com/kawanet/weboverlay
 */

import {RequestHandler, Router} from "express";
import {requestHandler} from "express-intercept";

export class Layer {
    private host: string;
    private hostRE: RegExp;
    private path: string;
    private pathRE: RegExp;
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
                layer.setHost(path.split("/")[2]);
                layer.path = path.replace(/^\/\/[^\/]+/, "");

            } else if (/^\^/.test(path)) {
                // ^/regexp/ = def
                layer.pathRE = new RegExp(path);

            } else {
                // /normal/path/ = def
                layer.path = path;
            }
        }

        layer.def = def;
        return layer;
    }

    private setHost(host: string) {
        if (/[*?]/.test(host)) {
            this.hostRE = wildcardToRE(host, "[^.:]");
        } else {
            this.host = host;
        }
    }

    match(re: RegExp) {
        return re.test(this.def);
    }

    handler(handler: RequestHandler) {
        // wrap with requestHandler to enable Named Virtual Hosts
        if (this.hostRE) {
            handler = requestHandler().for(req => this.hostRE.test(req.headers.host)).use(handler);
        }

        if (this.host) {
            handler = requestHandler().for(req => req.headers.host === this.host).use(handler);
        }

        if (this.pathRE) {
            handler = requestHandler().for(req => this.pathRE.test(req.path)).use(handler);
        }

        // wrap with .use() if mount path is specified other than root
        if (this.path) {
            handler = Router().use(this.path, handler);
        }

        return handler;
    }

    toString() {
        let {host, path, pathRE, def} = this;
        host = host ? "//" + host : "";
        if (!path && !pathRE) path = "/";
        if (!path && pathRE) path = String(pathRE).replace(/^\/|\/$/sg, "");
        if (!def) def = "";
        return `${host}${path} = ${def}`;
    }
}

const wildcardToRE = (str: string, allow: string): RegExp => {
    str = str.replace(/(\?|\*\*?|[^\w\u0100-\uFFFF?*]+)/g, c => {
        if (c === "?") {
            return allow;
        } else if (c === "*") {
            return allow + `*`;
        } else if (c === "**") {
            return `.*`;
        } else {
            return `\\` + c;
        }
    });

    return new RegExp(`^${str}$`);
};
