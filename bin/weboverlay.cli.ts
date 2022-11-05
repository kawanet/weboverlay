#!/usr/bin/env node

import {promises as fs} from "fs";
import * as YAML from "yaml";

const argv = require("process.argv")(process.argv.slice(2));

import {weboverlay, WebOverlayOptions} from "../";

interface CLIOptions extends WebOverlayOptions {
    config?: string;
    "--"?: string[];
}

const defaults: WebOverlayOptions = {
    log: "tiny",
    port: 3000,
};

async function CLI(args: CLIOptions) {
    const {basic, cache, compress, config, index, json, log, logfile, port} = args;

    const options: CLIOptions = {cache, compress, index, json, log, logfile, port};

    // Basic authentication
    if ("string" === typeof basic) options.basic = basic.split(",");

    // Layers
    const layers = args["--"];
    if (layers?.length) options.layers = layers;

    // WITHOUT --config=
    if (!config) {
        weboverlay(merge(defaults, options));
        return;
    }

    // WITH --config=weboverlay.yml
    // OR   --config=first.yml,second.yml,third.yml
    const files = config.split(",");
    for (const file of files) {
        const yaml = await fs.readFile(file, "utf-8");
        const data = YAML.parse(yaml) as CLIOptions;
        const merged = merge(defaults, data, options);

        if (files.length > 1 && !merged.logfile && merged.port) {
            const log = (message: string) => console.log(`[${merged.port}] ${message}`);
            merged.logger = {log};
        }

        weboverlay(merged);
    }
}

function merge(...options: WebOverlayOptions[]): WebOverlayOptions {
    let option: WebOverlayOptions = {};

    for (const opt of options) {
        Object.keys(opt).forEach((key: keyof WebOverlayOptions) => {
            if (opt[key] !== undefined) option[key] = opt[key];
        });
    }

    return option;
}

CLI(argv()).catch(fatal);

function fatal(e: Error | any) {
    if (e) console.warn(e.message || e);
    const cmd = process.argv.slice(0, 2).map(s => s.split("/").pop()).join(" ");
    console.warn("Usage: " + cmd + " htdocs https://example.com/ --cache=cached --log=dev --port=3000");
}
