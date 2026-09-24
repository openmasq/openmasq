#!/usr/bin/env node
// `tsc` emits JavaScript and nothing else, so the console's three assets — the page, its
// generated token sheet and the brand mark — have to be put beside their compiled module by
// hand. Two lines of work, and the alternative (a template string) would hide a 450-line
// design asset inside TypeScript where nobody could diff it against the kit it came from.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "../src/features/console");
const to = join(here, "../dist/features/console");
mkdirSync(to, { recursive: true });
for (const name of ["index.html", "tokens.css", "app.js", "mark.svg", "mark-dark.svg"]) {
  copyFileSync(join(from, name), join(to, name));
}
console.log("console assets copied to dist/features/console");
