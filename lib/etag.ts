/**
 * https://github.com/kawanet/weboverlay
 */

import {responseHandler} from "express-intercept";
import * as express from "express";

const enum HTTP {
    OK = 200,
    NotModified = 304,
}

interface ResponseX extends express.Response {
    "if-none-match": string;
}

const normalize = (str: any) => String(str).replace(/^W\/|"/g, "");

export function etagHandler() {
    return responseHandler()
        .for(req => {
            // reserve original header
            const res = req.res as ResponseX;
            const ifNoneMatch = res["if-none-match"] = req.headers["if-none-match"];

            // remove other conditional request headers
            delete req.headers["if-match"];
            delete req.headers["if-modified-since"];
            delete req.headers["if-range"];
            delete req.headers["if-none-match"];
            delete req.headers["if-unmodified-since"];

            // run only for request which has If-None-Match: header
            return !!ifNoneMatch;
        })
        .getResponse((res: ResponseX): void => {
            // run check only for 200 OK
            if (res.statusCode !== HTTP.OK) return;

            // run check only for response which has ETag: header
            const etag = res.getHeader("etag");
            if (!etag) return;

            // skip when contents changed
            if (normalize(etag) !== normalize(res["if-none-match"])) return;

            // override status 403 Not Modified
            res.statusCode = HTTP.NotModified;
        });
}
