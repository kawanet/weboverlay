#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../";

const TITLE = __filename.split("/").pop();

const documentRoot = __dirname + "/htdocs";

describe(TITLE, () => {
    const options: WebOverlayOptions = {
        layers: [
            "# wildcard-host",

            // transformed
            "//*.net/sample/ = s/Hello/Hi/",
            "//*.net/sample/ = " + documentRoot,

            // original
            "//*.com/sample/ = " + documentRoot,

            // not found
            "//*.org/sample/ = 404",

            // bad request
            "//*.org:3000/sample/ = 400",

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
        const host = "example.org:3000";
        const path = "/sample/sample.html";
        it(host + path, async () => {
            await agent.get(path).set({host: host}).expect(400);
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
