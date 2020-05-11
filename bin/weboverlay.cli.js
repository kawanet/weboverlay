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
    const { basic, cache, json, log, port } = args;
    const options = { cache, json, log, port };
    if (basic)
        options.basic = basic.split(",");
    options.logger = console;
    options.layers = args["--"];
    return weboverlay_1.weboverlay(options);
}
CLI(argv(defaults)).catch(fatal);
function fatal(e) {
    if (e)
        console.warn(e.message || e);
    const cmd = process.argv.slice(0, 2).map(s => s.split("/").pop()).join(" ");
    console.warn("Usage: " + cmd + " htdocs https://example.com/ --cache=cached --log=dev --port=3000");
}
