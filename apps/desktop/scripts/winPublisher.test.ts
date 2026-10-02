import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * The Windows `publisherName` is the anchor the INSTALLED app checks every update's
 * signature against. It lives outside the tree (AZURE_CODESIGN_PUBLISHER, a release
 * secret). A SIGNED build without it would bake no anchor, and the installed base would
 * stop checking who signed its updates — so the config refuses to sign without it.
 */
const CONFIG = resolve(__dirname, "../electron-builder.cjs");

/** Load the config in a fresh process (no require cache) with exactly this environment. */
function load(env: Record<string, string>) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("AZURE_")),
  ) as Record<string, string>;
  return spawnSync(
    process.execPath,
    ["-e", `const c=require(${JSON.stringify(CONFIG)});process.stdout.write(JSON.stringify(c.win.azureSignOptions??null))`],
    { env: { ...clean, ...env }, encoding: "utf8" },
  );
}

describe("Windows signing — the publisher anchor is never optional", () => {
  it("signing credentials without the publisher: the build refuses", () => {
    const r = load({ AZURE_CLIENT_SECRET: "x", AZURE_CODESIGN_ACCOUNT: "y" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("AZURE_CODESIGN_PUBLISHER");
  });

  it("with the publisher: it is the anchor electron-builder signs and pins", () => {
    const r = load({ AZURE_CLIENT_SECRET: "x", AZURE_CODESIGN_ACCOUNT: "y", AZURE_CODESIGN_PUBLISHER: "CN=Example, O=Example" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).publisherName).toBe("CN=Example, O=Example");
  });

  it("no signing credentials (a fork, a local build): unsigned, no error", () => {
    const r = load({});
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toBeNull();
  });
});
