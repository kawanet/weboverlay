#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay} from "../";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {
    it(`If-None-Match:`, async () => {
        const app = weboverlay({
            layers: [
                `# etag`,
                `s/foo/FOO/`,
                `${__dirname}/htdocs`,
            ],
        });

        const agent = supertest(app);
        let etag: string;

        await agent.get("/sample.html")
            .expect(200)
            .expect(/FOO:bar:buz/)
            .then(res => {
                etag = res.headers["etag"];
                assert.match(etag, /^"?W/);
            });

        // unmatched
        await agent.get("/sample.html")
            .set({"If-None-Match": `W/xxxx`})
            .expect(200) // OK
            .expect(/FOO:bar:buz/)
            .expect("etag", etag);

        // matched
        await agent.get("/sample.html")
            .set({"If-None-Match": etag})
            .expect(304) // Not Modified
            .expect("etag", etag)
            .expect(""); // empty body
    });
});
