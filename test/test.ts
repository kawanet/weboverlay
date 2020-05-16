#!/usr/bin/env mocha -R spec

import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../lib/weboverlay";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {
    const options: WebOverlayOptions = {
        logger: console,
        log: "tiny",
        layers: [
            "s/Hello/Hi/",
            __dirname + "/htdocs"
        ]
    };

    const app = weboverlay(options)
    const agent = supertest(app);

    {
        const path = "/sample.html";
        it(path, async () => {
            await agent.get(path).expect(200).expect(res => /Hi,/.test(res.text));
        });
    }

    {
        const path = "/not-found.html";
        it(path, async () => {
            await agent.get(path).expect(404);
        });
    }
});
