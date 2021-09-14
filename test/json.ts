#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../";

const TITLE = __filename.split("/").pop();

/**
 * Tests for JSON spacer
 */

describe(TITLE, () => {

    [2, "   ", 4, "\t"].forEach(json => {
        const spacer = +json ? " ".repeat(+json) : json;
        const options: WebOverlayOptions = {
            json: json,
            layers: [
                `# json: ${json}`,
                `${__dirname}/htdocs`,
            ]
        };

        const app = weboverlay(options)
        const agent = supertest(app);
        const path = "/sample.json";
        const expect = require("./htdocs/sample.json");

        it(JSON.stringify({json}), async () => {
            await agent.get(path)
                .responseType("text")
                .expect(200)
                .then(res => {
                    const body = String(res.body);
                    assert.deepEqual(JSON.parse(body), expect);
                    assert.equal(body.split(/",[\r\n]*(\s*)"/)[1], spacer);
                });
        });
    });
});
