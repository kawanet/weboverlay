#!/usr/bin/env node

const argv = require("process.argv")(process.argv.slice(2));

import {weboverlay, WebOverlayOptions} from "../lib/weboverlay";

const defaults = {
    log: "tiny",
    // cache: "cached",
    port: "3000",
};

async function CLI(args: any) {
    const {basic, cache, json, log, port} = args;

    const options: WebOverlayOptions = {cache, json, log, port};

    // Basic authentication
    if (basic) options.basic = basic.split(",");

    // Logging
    options.logger = console;

    options.layers = args["--"];

    return weboverlay(options);
}

CLI(argv(defaults)).catch(fatal);

function fatal(e: Error | any) {
    if (e) console.warn(e.message || e);
    const cmd = process.argv.slice(0, 2).map(s => s.split("/").pop()).join(" ");
    console.warn("Usage: " + cmd + " htdocs https://example.com/ --cache=cached --log=dev --port=3000");
}
