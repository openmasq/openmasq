// `net/safeOpen.ts` says every path to `shell.openExternal` is scheme-gated in ONE place.
// It wasn't: `openAuthExternal` called `shell.openExternal` raw — on a URL taken from a
// REMOTE MCP server's discovery document (`authorization_endpoint`), i.e. attacker-chosen.
// A `file:///…`, `smb://…` or custom-scheme authorize URL went straight to the OS, which is
// the exact vector audit M-3 closed everywhere else.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const openExternal = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
vi.mock("electron", () => ({ shell: { openExternal: (u: string) => openExternal(u) } }));

const emitMcpOauthUrl = vi.fn();
vi.mock("../server/registry", () => ({
  emitMcpOauthUrl: (id: string, url: string) => emitMcpOauthUrl(id, url),
}));
vi.mock("../server/connectCancel", () => ({ connectId: () => "conn-1" }));

import { openAuthExternal } from "./authOpen";

beforeEach(() => {
  openExternal.mockClear();
  emitMcpOauthUrl.mockClear();
});

describe("openAuthExternal is scheme-gated like every other external open", () => {
  it("opens a real https authorize URL", async () => {
    await openAuthExternal("https://slack.com/oauth/v2/authorize?client_id=1");
    expect(openExternal).toHaveBeenCalledWith("https://slack.com/oauth/v2/authorize?client_id=1");
  });

  it.each([
    "file:///etc/passwd",
    "smb://attacker/share",
    "evil-app://run?cmd=rm",
    "javascript:alert(1)",
  ])("hands %s to nothing", async (url) => {
    await openAuthExternal(url);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("still surfaces the URL to the renderer's copy affordance — the gate is on the OS hand-off", async () => {
    await openAuthExternal("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    expect(emitMcpOauthUrl).toHaveBeenCalledWith(
      "conn-1",
      "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    );
  });
});

/* The claim in `net/safeOpen.ts` is only true if it stays true — a new raw call is how this
   one appeared. One documented exception, and it is a hard-coded literal. */
describe("no raw shell.openExternal anywhere in main", () => {
  const MAIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const ALLOWED: Record<string, string> = {
    "net/safeOpen.ts": "the gate itself",
    "runtime/permissions.ts":
      "a HARD-CODED `x-apple.systempreferences:` deep link (the mic-settings pane) — no URL " +
      "from anywhere reaches it, and the gate would refuse the scheme by design",
  };

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e !== "node_modules" && e !== "dist") walk(p, out);
      } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
    }
    return out;
  }

  it("every other module goes through safeOpenExternal", () => {
    const raw: string[] = [];
    for (const file of walk(MAIN)) {
      const rel = file.slice(MAIN.length + 1);
      if (rel in ALLOWED) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment naming it is documentation
          if (/shell\.openExternal\(/.test(line)) raw.push(`${rel}:${i + 1}`);
        });
    }
    expect(raw).toEqual([]);
  });
});
