/**
 * https://github.com/kawanet/weboverlay
 */

import {responseHandler} from "express-intercept";
import * as iconv from "iconv-lite";

type MicroRes = { getHeader: (key: string) => any };
const getContentType = (res: MicroRes) => String(res.getHeader("content-type"));
const testContentType = (res: MicroRes, re: RegExp) => re.test(getContentType(res));
const getCharset = (str: string) => str.split(/^.*?\Wcharset=["']?([^"']+)/)[1];

/**
 * encode response buffer from UTF-8 to given charset
 */

export const encodeBuffer = responseHandler()
    .if(res => testContentType(res, /^(text|application)\//))
    .if(res => testContentType(res, /\Wcharset=/))
    .replaceBuffer((buf, _, res) => {
        const charset = getCharset(getContentType(res));
        if (charset && !/^utf-8/i.test(charset)) {
            buf = iconv.encode(buf.toString(), charset);
        }
        return buf;
    });

/**
 * decode response buffer from given charset to UTF-8
 */

export const decodeBuffer = responseHandler()
    .if(res => testContentType(res, /^(text|application)\//))
    .if(res => testContentType(res, /\Wcharset=/))
    .replaceBuffer((buf, _, res) => {
        const charset = getCharset(getContentType(res));
        if (charset && !/^utf-8/i.test(charset)) {
            buf = Buffer.from(iconv.decode(buf, charset));
        }
        return buf;
    });
