import * as express from "express";
export interface WebOverlayOptions {
    basic?: string | string[];
    cache?: string;
    compress?: string;
    json?: number;
    layers?: string[];
    log?: string;
    logger?: {
        log: (message: string) => void;
    };
    port?: string;
}
export declare function weboverlay(options: WebOverlayOptions): express.Express;
