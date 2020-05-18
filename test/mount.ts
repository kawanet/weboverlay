#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../lib/weboverlay";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {
    const options: WebOverlayOptions = {
        layers: [
            // transform only for path
            "/mount/ = s/Hello/Hi/",

            // 403 Forbidden
            "/forbidden/ = 403",

            // 500 Internal Server Error
            "/error/ = 500",

            // mount position
            "/mount/ = " + __dirname + "/htdocs"
        ]
    };

    const app = weboverlay(options)
    const agent = supertest(app);

    {
        const path = "/mount/sample.html";
        it(path, async () => {
            await agent.get(path).expect(200).expect(res => {
                assert.ok(/Hi, weboverlay!/.test(res.text));
            });
        });
    }

    {
        const path = "/sample.html";
        it(path, async () => {
            await agent.get(path).expect(404);
        });
    }

    {
        const path = "/forbidden/";
        it(path, async () => {
            await agent.get(path).expect(403);
        });
    }

    {
        const path = "/error/";
        it(path, async () => {
            await agent.get(path).expect(500);
        });
    }
});
