#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {

    it("packed.git:public", async () => {

        const options: WebOverlayOptions = {
            // logger: console,
            // log: "tiny",
            layers: [
                `# git`,
                "s/branch/BRANCH/",
                __dirname + `/git/packed.git:public`,
                __dirname + "/htdocs"
            ]
        };

        const app = weboverlay(options)
        const agent = supertest(app);

        // git main branch

        await agent.get("/dir/file.html")
            .set("host", "main.localhost")
            .expect(200)
            .expect(res => {
                assert.ok(/html/.test(res.type));
                assert.ok(/main/.test(res.text));
                assert.ok(!/wip/.test(res.text));
                assert.ok(!/branch/.test(res.text));
                assert.ok(/BRANCH/.test(res.text));
            });

        // git wip branch

        await agent.get("/dir/file.html")
            .set("host", "wip.localhost")
            .expect(200)
            .expect(res => {
                assert.ok(/html/.test(res.type));
                assert.ok(!/main/.test(res.text));
                assert.ok(/wip/.test(res.text));
                assert.ok(!/branch/.test(res.text));
                assert.ok(/BRANCH/.test(res.text));
            });

        await agent.get("/dir/file.html?_=1638073638").expect(200);
        await agent.get("/dir/not-found.html").expect(404);

        // pass through to htdocs

        await agent.get("/sample.html").expect(200);
        await agent.get("/not-found.html").expect(404);
    })

    it("/mount/ = packed.git:public/dir/", async () => {
        const options: WebOverlayOptions = {
            layers: [
                `/mount/ = ${__dirname}/git/packed.git:public/dir/`,
            ]
        };

        const app = weboverlay(options)
        const agent = supertest(app);
        await agent.get("/mount/file.html").expect(200);
        await agent.get("/dir/file.html").expect(404);
    })
})
