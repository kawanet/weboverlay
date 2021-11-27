#!/usr/bin/env mocha -R spec

import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../";

const TITLE = __filename.split("/").pop();

/**
 * Tests for Basic authentication
 */

describe(TITLE, () => {
    const options: WebOverlayOptions = {
        basic: [
            // echo -n 'test1:first' | base64
            "test1:first", // "dGVzdDE6Zmlyc3Q="
            // echo -n 'test2:second' | base64
            "dGVzdDI6c2Vjb25k" // "test2:second"
        ],
        layers: [
            "# auth",
            __dirname + "/htdocs"
        ]
    };

    const app = weboverlay(options)
    const agent = supertest(app);
    const path = "/sample.html";

    {
        it("without auth", async () => {
            await agent.get(path).expect(401);
        });
    }

    {
        it("raw", async () => {
            const auth = "basic dGVzdDE6Zmlyc3Q="; // "test1:first"
            await agent.get(path).set({Authorization: auth}).expect(200);
        });
    }

    {
        it("base64", async () => {
            const auth = "basic dGVzdDI6c2Vjb25k"; // "test2:second"
            await agent.get(path).set({Authorization: auth}).expect(200);
        });
    }
});
