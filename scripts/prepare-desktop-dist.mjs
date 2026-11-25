import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const clientDirectory = resolve("dist/client");
await copyFile(resolve(clientDirectory, "_shell.html"), resolve(clientDirectory, "index.html"));
