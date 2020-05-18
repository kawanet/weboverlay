#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const YAML = require("yaml");
const argv = require("process.argv")(process.argv.slice(2));
const weboverlay_1 = require("../lib/weboverlay");
const defaults = {
    log: "tiny",
    port: "3000",
};
async function CLI(args) {
    const { basic, cache, compress, config, json, log, port } = args;
    const options = { cache, compress, json, log, port };
    if ("string" === typeof basic)
        options.basic = basic.split(",");
    options.layers = args["--"] || [];
    if (config) {
        const yaml = await fs.promises.readFile(config, "utf-8");
        const data = YAML.parse(yaml);
        Object.keys(data).forEach((key) => options[key] = data[key]);
    }
    const logfile = args.logfile || options.logfile;
    if (logfile) {
        const writable = fs.createWriteStream(logfile, { flags: "a" });
        options.logger = { log: (message) => writable.write(String(message).replace(/\n*$/, "\n")) };
    }
    weboverlay_1.weboverlay(options);
}
CLI(argv(defaults)).catch(fatal);
function fatal(e) {
    if (e)
        console.warn(e.message || e);
    const cmd = process.argv.slice(0, 2).map(s => s.split("/").pop()).join(" ");
    console.warn("Usage: " + cmd + " htdocs https://example.com/ --cache=cached --log=dev --port=3000");
}
