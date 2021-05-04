/**
 * Layered Hybrid Web Server: local files, upstream proxy and content transform
 * @see https://github.com/kawanet/weboverlay
 */

import * as express from "express";

export declare function weboverlay(options: WebOverlayOptions): express.Express;

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
    logger?: {
        log: (message: string) => void;
    };

    /**
     * port number to listen
     */
    port?: string;
}
