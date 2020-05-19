import * as express from "express";
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
     * prettify JSON response
     */
    json?: number;
    /**
     * content source layers: Local, Remote, and Transform
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
/**
 * Layered Hybrid Web Server: Local, Remote, and Transform
 * @see https://github.com/kawanet/weboverlay
 */
export declare function weboverlay(options: WebOverlayOptions): express.Express;
