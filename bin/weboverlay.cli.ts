#!/usr/bin/env node

import * as fs from "fs";
import * as YAML from "yaml";

const argv = require("process.argv")(process.argv.slice(2));

import {weboverlay, WebOverlayOptions} from "../lib/weboverlay";

const defaults = {
    log: "tiny",
    // cache: "cached",
    port: "3000",
};

async function CLI(args: any) {
    const {basic, cache, compress, json, log, port, config} = args;

    const options: WebOverlayOptions = {cache, compress, json, log};

    // Basic authentication
    if ("string" === typeof basic) options.basic = basic.split(",");

    options.layers = args["--"] || [];

    // --config=weboverlay.yml
    if (config) {
        const yaml = await fs.promises.readFile(config, "utf-8");
        const data = YAML.parse(yaml);
        Object.keys(data).forEach(key => (options as any)[key] = data[key]);
    }

    /**
     * --logfile=weboverlay.log
     */

    const logfile = args.logfile || (options as any).logfile;
    if (logfile) {
        const writable = fs.createWriteStream(logfile, {flags: "a"});
        options.logger = {log: (message: string) => writable.write(String(message).replace(/\n*$/, "\n"))};
    } else {
        options.logger = console;
    }

    weboverlay(options).listen(port, () => options.logger.log("port: " + port));
}

CLI(argv(defaults)).catch(fatal);

function fatal(e: Error | any) {
    if (e) console.warn(e.message || e);
    const cmd = process.argv.slice(0, 2).map(s => s.split("/").pop()).join(" ");
    console.warn("Usage: " + cmd + " htdocs https://example.com/ --cache=cached --log=dev --port=3000");
}
