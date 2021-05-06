#!/usr/bin/env node

import * as fs from "fs";
import * as YAML from "yaml";

const argv = require("process.argv")(process.argv.slice(2));

import {weboverlay, WebOverlayOptions} from "../";

interface CLIOptions extends WebOverlayOptions {
    config?: string;
    logfile?: string;
}

const defaults: WebOverlayOptions = {
    log: "tiny",
    port: "3000",
};

async function CLI(args: CLIOptions) {
    const {basic, cache, compress, config, index, json, log, port} = args;

    const options: CLIOptions = {cache, compress, index, json, log, port};

    // Basic authentication
    if ("string" === typeof basic) options.basic = basic.split(",");

    options.layers = (args as any)["--"] || [];

    // --config=weboverlay.yml
    if (config) {
        const yaml = await fs.promises.readFile(config, "utf-8");
        const data = YAML.parse(yaml) as CLIOptions;
        Object.keys(data).forEach((key: keyof CLIOptions) => (options as any)[key] = data[key]);
    }

    /**
     * --logfile=weboverlay.log
     */

    const logfile = args.logfile || options.logfile;
    if (logfile) {
        const writable = fs.createWriteStream(logfile, {flags: "a"});
        options.logger = {log: (message: string) => writable.write(String(message).replace(/\n*$/, "\n"))};
    }

    weboverlay(options);
}

CLI(argv(defaults)).catch(fatal);

function fatal(e: Error | any) {
    if (e) console.warn(e.message || e);
    const cmd = process.argv.slice(0, 2).map(s => s.split("/").pop()).join(" ");
    console.warn("Usage: " + cmd + " htdocs https://example.com/ --cache=cached --log=dev --port=3000");
}
