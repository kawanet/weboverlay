#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const argv = require("process.argv")(process.argv.slice(2));
const weboverlay_1 = require("../lib/weboverlay");
const defaults = {
    log: "tiny",
    port: "3000",
};
async function CLI(args) {
    const options = {
        source: args["--"],
        json: args.json,
        log: args.log,
        cache: args.cache,
        port: args.port,
        logger: console,
    };
    return weboverlay_1.weboverlay(options);
}
CLI(argv(defaults)).catch(fatal);
function fatal(e) {
    if (e)
        console.warn(e.message || e);
    const cmd = process.argv.slice(0, 2).map(s => s.split("/").pop()).join(" ");
    console.warn("Usage: " + cmd + " htdocs https://example.com/ --cache=cached --log=dev --port=3000");
}
