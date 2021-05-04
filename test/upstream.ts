#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as express from "express";
import * as morgan from "morgan";
import * as net from "net";
import * as supertest from "supertest";

import {weboverlay} from "../";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {
    let onEnd: any;
    let port: number;

    before(async () => {
        const upstream = express();
        upstream.use(morgan("tiny"));
        const server = upstream.listen(0);
        onEnd = () => server.close();
        port = (server.address() as net.AddressInfo).port;
        const url = `http://127.0.0.1:${port}`;

        upstream.use(express.static(`${__dirname}/htdocs`));

        upstream.use("/status/:status([0-9]{3})", (req, res) => {
            res.status(+req.params.status).end();
        });

        upstream.use("/redirect/", (req, res) => {
            const location = `${url}${req.query.path}`;
            res.status(302).header({location}).end();
        });
    });

    it("upstream on root", async () => {
        const agent = supertest(weboverlay({
            layers: [
                `/ = http://127.0.0.1:${port}/`,
            ]
        }));

        await agent.get("/sample.html").expect(200).expect(res => {
            assert.ok(/Hello, weboverlay!/.test(res.text));
        });

        await agent.get("/status/204").expect(204);

        await agent.get("/redirect/?path=/status/204").expect(302).expect(res => {
            const {location} = res.headers;
            assert.equal(location, "/status/204");
        });
    });

    it("upstream on directory", async () => {
        const agent = supertest(weboverlay({
            layers: [
                `/stat/ = http://127.0.0.1:${port}/status/`,
                `/redir/ = http://127.0.0.1:${port}/redirect/`,
            ]
        }));

        await agent.get("/sample.html").expect(404);

        await agent.get("/stat/204").expect(204);

        await agent.get("/redir/?path=/stat/204").expect(302).expect(res => {
            const {location} = res.headers;
            assert.equal(location, "/stat/204");
        });
    });

    after(() => onEnd());
});
