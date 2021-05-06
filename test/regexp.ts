#!/usr/bin/env mocha -R spec

// import {strict as assert} from "assert";
import * as supertest from "supertest";
import {weboverlay} from "../";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {

    const app = weboverlay({
        layers: [
            `# regexp`,
            `^/[^/]+\.css$ = ${__dirname}/htdocs`,
            `^/[^/]+\.map$ = 403`,

            `^/htdocs/[^/]+\.html$ = ${__dirname}`,
            `^/htdocs/[^/]+\.map$ = 403`,
        ],
    });

    const agent = supertest(app);

    {
        it("/sample.css", async () => {
            await agent.get("/sample.css").expect(200);
            await agent.get("/sample.css?_=1620173947").expect(200);
            await agent.get("/sample.html").expect(404);
            await agent.get("/sample.css.map").expect(403);

            await agent.get("/htdocs/sample.css").expect(404);
            await agent.get("/htdocs/sample.html").expect(200);
            await agent.get("/htdocs/sample.html?_=1620173947").expect(200);
            await agent.get("/htdocs/sample.css.map").expect(403);
        });
    }
});
