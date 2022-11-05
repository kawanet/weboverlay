#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay, WebOverlayOptions} from "../";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {

    it("middleware", async () => {

        const options: WebOverlayOptions = {
            logger: console,
            log: "tiny",
            layers: [
                `# middleware`,
                `/ok/ = (req, res, next) => res.send("OK")`,
                `/status/:status = (req, res, next) => res.status(req.params.status).end()`,
                `(req, res, next) => res.send({path: req.path})`,
            ]
        };

        const app = weboverlay(options)
        const agent = supertest(app);

        await agent.get("/ok/")
            .expect(200)
            .expect(res => {
                assert.equal(res.text, "OK");
            });

        await agent.get("/ok/xxx")
            .expect(200)
            .expect(res => {
                assert.equal(res.text, "OK");
            });

        await agent.get("/status/200")
            .expect(200);

        await agent.get("/status/400")
            .expect(400);

        await agent.get("/status/403")
            .expect(403);

        await agent.get("/")
            .expect(200)
            .expect(res => {
                assert.deepEqual(res.body, {path: "/"});
            });

        await agent.get("/xxx")
            .expect(200)
            .expect(res => {
                assert.deepEqual(res.body, {path: "/xxx"});
            });
    })
})
