#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import * as supertest from "supertest";
import * as iconv from "iconv-lite";

import {weboverlay} from "../";

const TITLE = __filename.split("/").pop();

describe(TITLE, () => {

    const app = weboverlay({
        layers: [
            `# xml-charset`,
            `s/０１２３４５６７８９/９８７６５４３２１０/`,
            `${__dirname}/htdocs`,
        ],
    });

    const agent = supertest(app);

    /**
     * UTF-8
     * https://www.google.com/search?hl=en&ie=utf8&q=%ef%bc%90%ef%bc%91%ef%bc%92%ef%bc%93%ef%bc%94%ef%bc%95%ef%bc%96%ef%bc%97%ef%bc%98%ef%bc%99
     */

    {
        it("/charset/utf-8/utf-8.xml", async () => {
            await agent.get("/charset/utf-8/utf-8.xml")
                .responseType("arraybuffer")
                .expect(200)
                .then(res => {
                    const type = res.get("content-type");
                    assert.equal(type, "application/xml; charset=utf-8");

                    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
                    const body = iconv.decode(buf, "utf-8");
                    assert.match(body, /９８７６５４３２１０/);
                });
        });
    }

    /**
     * Shift_JIS
     * https://www.google.com/search?hl=en&ie=shift_jis&q=%82%4f%82%50%82%51%82%52%82%53%82%54%82%55%82%56%82%57%82%58
     */

    {
        it("/charset/shift_jis/shift_jis.xml", async () => {
            await agent.get("/charset/shift_jis/shift_jis.xml")
                .responseType("arraybuffer")
                .expect(200)
                .then(res => {
                    const type = res.get("content-type");
                    assert.equal(type, "application/xml; charset=Shift_JIS");

                    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
                    const body = iconv.decode(buf, "Shift_JIS");
                    assert.match(body, /９８７６５４３２１０/);
                });
        });
    }

    /**
     * EUC-JP
     * https://www.google.com/search?hl=en&ie=euc-jp&q=%a3%b0%a3%b1%a3%b2%a3%b3%a3%b4%a3%b5%a3%b6%a3%b7%a3%b8%a3%b9
     */

    {
        it("/charset/euc-jp/euc-jp.xml", async () => {
            await agent.get("/charset/euc-jp/euc-jp.xml")
                .responseType("arraybuffer")
                .expect(200)
                .then(res => {
                    const type = res.get("content-type");
                    assert.equal(type, "application/xml; charset=EUC-JP");

                    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
                    const body = iconv.decode(buf, "EUC-JP");
                    assert.match(body, /９８７６５４３２１０/);
                });
        });
    }
});
