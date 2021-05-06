#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {
    const options: WebOverlayOptions = {
        // logger: console,
        // log: "tiny",
        layers: [
            "# basic",

            // empty
            "",

            // apply for any text
            "s/Hello/Hi/",

            // apply only for html
            "html( s => s.replace(/sample/,'FOO') )",

            // apply only for css
            "css( s => s.replace(/sample/,'BAR') )",

            // document root path
            __dirname + "/htdocs"
        ]
    };

    const app = weboverlay(options)
    const agent = supertest(app);

    {
        const path = "/sample.html";
        it(path, async () => {
            await agent.get(path).expect(200).expect(res => {
                assert.ok(/html/.test(res.type));
                assert.ok(/Hi, weboverlay!/.test(res.text));
                assert.ok(/FOO/.test(res.text)); // applied for html
                assert.ok(!/BAR/.test(res.text)); // not applied for css
            });
        });
    }

    {
        const path = "/sample.css";
        it(path, async () => {
            await agent.get(path).expect(200).expect(res => {
                assert.ok(/css/.test(res.type));
                assert.ok(/Hi, weboverlay!/.test(res.text));
                assert.ok(!/FOO/.test(res.text)); // not applied for html
                assert.ok(/BAR/.test(res.text)); // applied for css
            });
        });
    }

    {
        const path = "/not-found.html";
        it(path, async () => {
            await agent.get(path).expect(404);
        });
    }
});
