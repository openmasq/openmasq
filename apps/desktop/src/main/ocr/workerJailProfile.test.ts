import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { SANDBOX_EXEC, workerSeatbelt } from "./workerJail";

/**
 * The extraction worker's Seatbelt profile, probed LIVE (the Python jail's has the same kind of
 * test, `../python/sandboxProfile.test.ts`): a real Node started by `sandbox-exec` under
 * `workerSeatbelt`, trying what a parser taken over by a crafted file would try. A profile is
 * only what the kernel does with it, so the test asks the kernel.
 */
const live = process.platform === "darwin" && existsSync(SANDBOX_EXEC);
const node = realpathSync(process.execPath);
const root = realpathSync(mkdtempSync(join(tmpdir(), "omq-jail-")));
const granted = join(root, "granted");
const scratch = join(root, "scratch");
const other = join(root, "other");
for (const d of [granted, scratch, other]) mkdirSync(d);
writeFileSync(join(granted, "a.txt"), "ok");
writeFileSync(join(other, "b.txt"), "not yours");

/** the native decoder the worker loads by path, and the node_modules folder that holds it */
function canvas(): { entry: string; folders: string[] } | null {
  try {
    const dir = dirname(createRequire(import.meta.url).resolve("@napi-rs/canvas/package.json"));
    const cut = realpathSync(dir).lastIndexOf(`${sep}node_modules${sep}`);
    return { entry: dir, folders: [dir, realpathSync(dir), ...(cut === -1 ? [] : [realpathSync(dir).slice(0, cut + `${sep}node_modules`.length)])] };
  } catch {
    return null;
  }
}
const native = canvas();
/** this machine's build of that decoder: the `.node` file itself */
function nativeLibrary(): string | null {
  if (!native) return null;
  try {
    const dir = dirname(createRequire(join(native.entry, "package.json")).resolve(`@napi-rs/canvas-darwin-${process.arch}/package.json`));
    const file = readdirSync(dir).find((f) => f.endsWith(".node"));
    return file ? join(dir, file) : null;
  } catch {
    return null;
  }
}
// A Node that links libraries outside its own folder (Homebrew's) needs them to start at all:
// the app's own Node, baked beside it, is whole in its folder.
const nodeLibs = node.startsWith("/opt/homebrew/") ? ["/opt/homebrew"] : node.startsWith("/usr/local/") ? ["/usr/local"] : [];
const read = [dirname(dirname(node)), granted, scratch, ...nodeLibs, ...(native?.folders ?? [])];

const PROBE = `
const fs = require("node:fs"), os = require("node:os"), net = require("node:net"), cp = require("node:child_process");
const t = (f) => { try { f(); return "ALLOWED"; } catch { return "denied"; } };
const [root, canvasEntry, port] = process.argv.slice(2);
const out = {
  readGranted: t(() => fs.readFileSync(root + "/granted/a.txt")),
  readOther: t(() => fs.readFileSync(root + "/other/b.txt")),
  listHome: t(() => fs.readdirSync(os.homedir())),
  listShared: t(() => fs.readdirSync("/Users/Shared")),
  listVolumes: t(() => fs.readdirSync("/Volumes")),
  listTmp: t(() => fs.readdirSync("/private/tmp")),
  passwd: t(() => fs.readFileSync("/etc/passwd")),
  writeScratch: t(() => fs.writeFileSync(root + "/scratch/x", "1")),
  writeGranted: t(() => fs.writeFileSync(root + "/granted/y", "1")),
  exec: t(() => cp.execFileSync("/bin/echo", ["hi"])),
  wasm: t(() => new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))),
  canvas: canvasEntry ? t(() => { const c = require(canvasEntry).createCanvas(8, 8); c.getContext("2d").fillRect(0, 0, 4, 4); c.toBuffer("image/png"); }) : "absent",
};
const s = net.connect(Number(port), "127.0.0.1");
const done = (v) => { out.loopback = v; process.stdout.write(JSON.stringify(out) + "\\n", () => process.exit(0)); };
s.on("connect", () => done("ALLOWED"));
s.on("error", () => done("denied"));
`;
writeFileSync(join(granted, "probe.cjs"), PROBE);

describe("the extraction worker's macOS jail, asked of the kernel", () => {
  it.skipIf(!live)("reads its grants and nothing else, writes its folder only, starts no program, opens no connection — and still runs WASM and the native canvas", async () => {
    // a server on loopback, in the test's own process: even that is out of the worker's reach
    const server = createServer((s) => s.end()).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const port = (server.address() as { port: number }).port;
    const profile = workerSeatbelt({ read, write: [scratch], exec: node });
    // spawnSync blocks this loop, so the server never runs its handler: a connect that is ALLOWED
    // still completes in the kernel (the listen backlog), which is all the probe asks
    const r = spawnSync(SANDBOX_EXEC, ["-p", profile, node, join(granted, "probe.cjs"), root, native?.entry ?? "", String(port)], { encoding: "utf8", timeout: 30_000 });
    server.close();
    const out = JSON.parse(r.stdout.trim().split("\n").pop() || "{}") as Record<string, string>;
    expect({ stderr: r.stderr.slice(-300), ...out }).toMatchObject({
      readGranted: "ALLOWED",
      readOther: "denied",
      listHome: "denied",
      listShared: "denied",
      listVolumes: "denied",
      listTmp: "denied",
      passwd: "denied",
      writeScratch: "ALLOWED",
      writeGranted: "denied",
      exec: "denied",
      wasm: "ALLOWED",
      loopback: "denied",
    });
    if (native) expect(out.canvas).toBe("ALLOWED");
  }, 40_000);

  it.skipIf(!live)("cannot reach LaunchServices (a service that starts a program OUTSIDE the jail)", () => {
    // the same probe as the Python jail's: reached, `lsappinfo front` prints the front app's ASN
    const profile = workerSeatbelt({ read, write: [scratch], exec: "/usr/bin/lsappinfo" });
    const r = spawnSync(SANDBOX_EXEC, ["-p", profile, "/usr/bin/lsappinfo", "front"], { encoding: "utf8", timeout: 15_000 });
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/ASN:0x/);
  });

  it.skipIf(!live)("a library dropped in the folder it writes is not loaded", () => {
    // code is mapped from the grants only, never from the scratch, although the scratch is readable
    const lib = nativeLibrary();
    if (!lib) return;
    const copy = join(scratch, "dropped.node");
    writeFileSync(copy, readFileSync(lib));
    const load = `try { require(${JSON.stringify(copy)}); console.log("LOADED"); } catch { console.log("refused"); }`;
    const last = (out: string) => out.trim().split("\n").pop();
    // the control: outside the jail the very same copy loads, so a refusal inside is the profile's
    expect(last(spawnSync(node, ["-e", load], { encoding: "utf8", timeout: 30_000 }).stdout)).toBe("LOADED");
    const profile = workerSeatbelt({ read, write: [scratch], exec: node });
    expect(last(spawnSync(SANDBOX_EXEC, ["-p", profile, node, "-e", load], { encoding: "utf8", timeout: 30_000 }).stdout)).toBe("refused");
  });
});
