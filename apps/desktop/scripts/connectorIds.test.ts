// Every connector client id main reads must actually REACH a packaged build.
//
// Main reads `process.env.OPENMASQ_*_CLIENT_ID` at runtime, and a shipped app inherits
// no build-time variable: the define bake is the only transport. The regression this
// pins: an id read by `mcp/connectors` whose define is dropped ships empty in every
// packaged build while dev, which inherits the builder's env, looks fine — the exact
// asymmetry that makes the class invisible until a user installs.
//
// Second half: a developer after a bare `git pull` gets WORKING GitHub / Slack /
// Microsoft connectors (product decision, 02/09/2026) — so those ids must also carry a
// committed default in `publicServices.ts`. Google is the documented exception: its
// flow wants the client secret too, and that one belongs to an account.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mainDefines } from "./buildDefines";
import { publicServiceDefaults } from "./publicServices";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONNECTORS = readFileSync(join(HERE, "..", "src", "main", "mcp", "connectors", "index.ts"), "utf8");

const ENV_ONLY = new Set(["OPENMASQ_GOOGLE_CLIENT_ID"]); // header: the documented exception

const read = [...CONNECTORS.matchAll(/process\.env\.(OPENMASQ_[A-Z_]*CLIENT_ID)/g)].map((m) => m[1]);
const ids = [...new Set(read)];

describe("connector client ids reach the build they are read in", () => {
  it("finds ids to check at all", () => {
    expect(ids.length).toBeGreaterThanOrEqual(4);
  });

  it("every id main reads is baked by a define", () => {
    const defines = mainDefines();
    const unbaked = ids.filter((id) => !(`process.env.${id}` in defines));
    expect(unbaked).toEqual([]);
  });

  it("every id but the documented exception has a committed default (git-pull usability)", () => {
    const defaults = publicServiceDefaults("example.org") as Record<string, string>;
    const missing = ids.filter((id) => !ENV_ONLY.has(id) && !defaults[id]);
    expect(missing).toEqual([]);
  });
});
