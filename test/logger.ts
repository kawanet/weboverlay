#!/usr/bin/env mocha -R spec

import {strict as assert} from "assert";
import {promises as fs} from "fs";
import * as os from "os";
import * as process from "process";
import * as supertest from "supertest";
import {weboverlay} from "../";

const TITLE = __filename.split("/").pop();
const SLEEP = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));
const GET = (str: string) => /GET/.test(str);

describe(TITLE, () => {
    it(`logger: {log}`, async () => {
        const logs: string[] = [];

        const app = weboverlay({
            logger: {log: message => logs.push(message)},
            layers: ["/ = 200"]
        });

        const agent = supertest(app);
        await agent.get("/").expect(200);

        assert.match(logs.filter(GET).pop(), /^GET \/ /);
    });

    /**
     * @see https://www.npmjs.com/package/morgan
     */
    it(`log: "combined"`, async () => {
        const logs: string[] = [];

        const app = weboverlay({
            log: "combined",
            logger: {log: message => logs.push(message)},
            layers: ["/ = 200"]
        });

        const agent = supertest(app);
        await agent.get("/").expect(200);

        assert.match(logs.filter(GET).pop(), / "GET \/ HTTP/);
    });


    const logfile = `${os.tmpdir()}/weboverlay-test-${process.pid}.log`;

    it(`logfile: "${logfile}"`, async () => {
        const backup = `${logfile}~`;
        await fs.rm(logfile, {force: true});
        await fs.rm(backup, {force: true});

        const app = weboverlay({
            logfile: logfile,
            layers: ["/ = 200"]
        });

        const agent = supertest(app);
        await agent.get("/?no=1").expect(200);
        await fs.rename(logfile, backup);
        process.kill(process.pid, "SIGHUP");
        await SLEEP(10);

        const logs1 = await fs.readFile(backup, "utf-8");
        assert.match(logs1.split(/\n/).filter(GET).pop(), /^GET \/\?no=1 /);

        await agent.get("/?no=2").expect(200);
        process.kill(process.pid, "SIGHUP");
        await SLEEP(10);

        const logs2 = await fs.readFile(logfile, "utf-8");
        assert.match(logs2.split(/\n/).filter(GET).pop(), /^GET \/\?no=2 /);

        await fs.rm(logfile, {force: true});
        await fs.rm(backup, {force: true});
    });
});
