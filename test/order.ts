#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../lib/weboverlay";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {
    const options: WebOverlayOptions = {
        layers: [
            "# order",
            "s/foo/bar/g",
            "s/bar/buz/g",
            __dirname + "/htdocs",
        ]
    };

    const app = weboverlay(options)
    const agent = supertest(app);

    /**
     * The transform layers must be applied in ascending order.
     *
     * - ascending:  foo:bar:buz => bar:bar:buz => buz:buz:buz => OK!
     * - descending: foo:bar:buz => foo:buz:buz => bar:buz:buz => NG!
     */

    {
        const path = "/sample.html";
        it(path, async () => {
            await agent.get(path).expect(200).expect(res => {
                assert.ok(/buz:buz:buz/.test(res.text));
            });
        });
    }
});
