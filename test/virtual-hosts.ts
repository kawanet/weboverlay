#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../lib/weboverlay";

const TITLE = __filename.split("/").pop();

const documentRoot = __dirname + "/htdocs";

describe(TITLE, () => {
    const options: WebOverlayOptions = {
        layers: [
            // transformed
            "//example.net/sample/ = s/Hello/Hi/",
            "//example.net/sample/ = " + documentRoot,

            // original
            "//example.com/sample/ = " + documentRoot,

            // not found
            "//example.org/sample/ = 404",

            // forbidden
            "/sample/ = 403"
        ]
    };

    const app = weboverlay(options)
    const agent = supertest(app);

    {
        const host = "example.com";
        const path = "/sample/sample.html";
        it(host + path, async () => {
            await agent.get(path).set({host: host}).expect(200).expect(res => {
                assert.ok(/Hello, weboverlay!/.test(res.text)); // original
            });
        });
    }

    {
        const host = "example.net";
        const path = "/sample/sample.html";
        it(host + path, async () => {
            await agent.get(path).set({host: host}).expect(200).expect(res => {
                assert.ok(/Hi, weboverlay!/.test(res.text)); // transformed
            });
        });
    }

    {
        const host = "example.org";
        const path = "/sample/sample.html";
        it(host + path, async () => {
            await agent.get(path).set({host: host}).expect(404);
        });
    }

    {
        const path = "/sample/sample.html";
        it(path, async () => {
            await agent.get(path).expect(403);
        });
    }
});
