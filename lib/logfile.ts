/**
 * https://github.com/kawanet/weboverlay
 */

import * as fs from "fs";

export function fileLogger(file: string): ({ log: (message: string) => void }) {
    let writable: fs.WriteStream;

    const openFile = () => (writable || (writable = fs.createWriteStream(file, {flags: "a"})));

    // reopen when kill -HUP signal received
    process.on("SIGHUP", () => {
        logger.log("logger: SIGHUP");
        const written = writable;
        writable = null;
        if (written) written.close();
    });

    openFile();

    const logger = {
        log: (message: string) => openFile().write(String(message).replace(/\n*$/, "\n"))
    };

    return logger;
}
