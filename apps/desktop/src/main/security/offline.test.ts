import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Run in a child of its own: the cut is for the life of the process, and must not reach the
 * test runner. The child loads `offline.ts` the way the extraction worker does (first), then
 * tries what a parser taken over by a crafted file would try.
 */
const OFFLINE = fileURLToPath(new URL("./offline.ts", import.meta.url));
const PROBE = `
  await import(${JSON.stringify(OFFLINE)});
  const tryIt = async (f) => { try { await f(); return "ALLOWED"; } catch { return "denied"; } };
  const out = {
    fetch: await tryIt(() => fetch("https://example.com")),
    connect: await tryIt(() => require("node:net").connect(443, "1.1.1.1")),
    https: await tryIt(() => require("node:https").get("https://example.com")),
    dns: await tryIt(() => require("node:dns").lookup("example.com", () => {})),
    // the ways around the module functions: the classes themselves, UDP, HTTP/2, the promise resolvers
    socket: await tryIt(() => new (require("node:net").Socket)().connect(443, "1.1.1.1")),
    listen: await tryIt(() => new (require("node:net").Server)().listen(0)),
    udp: await tryIt(() => new (require("node:dgram").Socket)("udp4").send("x", 53, "1.1.1.1")),
    http2: await tryIt(() => require("node:http2").connect("https://example.com")),
    dnsPromises: await tryIt(() => require("node:dns").promises.resolve4("example.com")),
    resolver: await tryIt(() => new (require("node:dns").Resolver)().resolve4("example.com", () => {})),
    spawn: await tryIt(() => require("node:child_process").execSync("echo hi")),
  };
  // unasked, the probes above really open things (a listening server): leave once the line is written
  process.stdout.write(JSON.stringify(out) + "\\n", () => process.exit(0));
`;

function probe(env: Record<string, string>): Record<string, string> {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import { createRequire } from "node:module"; const require = createRequire(import.meta.url); ${PROBE}`], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
  const line = r.stdout.trim().split("\n").pop() ?? "";
  return JSON.parse(line || "{}");
}

describe("a parsing worker started offline", () => {
  it("can open no connection and start no program", () => {
    expect(probe({ OPENMASQ_OFFLINE: "1" })).toEqual({ fetch: "denied", connect: "denied", https: "denied", dns: "denied", socket: "denied", listen: "denied", udp: "denied", http2: "denied", dnsPromises: "denied", resolver: "denied", spawn: "denied" });
  });

  it("is untouched when its parent did not ask (development, where OCR assets may come from the network)", () => {
    expect(probe({ OPENMASQ_OFFLINE: "" }).spawn).toBe("ALLOWED");
  });
});
