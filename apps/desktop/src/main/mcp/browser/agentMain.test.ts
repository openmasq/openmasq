// The SSRF floor of the agent browser, pinned AT THE SINK.
//
// The regression: `navUrlBlocked` + `assertPublicUrl` were attached to `will-navigate` /
// `will-redirect` only — and Electron does NOT fire those for a `loadURL` the app itself
// issues. So the two programmatic entry points reachable from the renderer panel
// (`browser:navigate` → `navigate`, `tab-new` → `createTab`) went to Chromium having passed
// the SCHEME check alone: `http://127.0.0.1:11434`, `http://192.168.1.1/`,
// `http://printer.local/` all loaded, in a browser holding the user's logged-in sessions.
//
// So the guard is now a property of LOADING, and this file pins both halves: the guard's
// own behaviour, and the fact that the two sinks route through it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getLocale: () => "fr-FR",
    getPath: () => "/tmp",
    whenReady: () => new Promise(() => {}),
  },
  BaseWindow: class {},
  WebContentsView: class {},
  session: { defaultSession: {} },
}));

// The DNS half of the floor. `isPrivateIp` stays REAL — the literal-address refusals are
// exactly what the sync half must still catch.
const assertPublicUrl = vi.fn<(url: string, source?: string) => Promise<string[]>>();
vi.mock("../../net/net", async () => ({
  assertPublicUrl: (url: string, source?: string) => assertPublicUrl(url, source),
  isPrivateIp: (await vi.importActual<typeof import("../../net/privateIp")>("../../net/privateIp"))
    .isPrivateIp,
  safeFetch: () => Promise.reject(new Error("not used")),
}));

import { loadGuarded } from "./loadGuard";

/** A stand-in for a tab's `webContents`: only what a guarded load touches. */
function fakeTab(destroyed = false) {
  const loaded: string[] = [];
  return {
    loaded,
    isDestroyed: () => destroyed,
    loadURL: (u: string) => {
      loaded.push(u);
      return Promise.resolve();
    },
  };
}

beforeEach(() => {
  assertPublicUrl.mockReset();
  assertPublicUrl.mockResolvedValue(["93.184.216.34"]);
});

describe("loadGuarded — the floor a programmatic load cannot skip", () => {
  it("loads a public https URL, and journals it as a browser egress", async () => {
    const tab = fakeTab();
    await loadGuarded(tab, "https://example.com/page");
    expect(tab.loaded).toEqual(["https://example.com/page"]);
    expect(assertPublicUrl).toHaveBeenCalledWith("https://example.com/page", "browser");
  });

  // The sync half: refused BEFORE any resolution, so a literal internal target never even
  // reaches DNS. These are the four shapes the event guard used to be the only holder of.
  it.each([
    ["file:///etc/passwd", "a local file"],
    ["data:text/html,<script>1</script>", "an inline document"],
    ["http://127.0.0.1:11434/api", "loopback"],
    ["http://192.168.1.1/admin", "a LAN address"],
    ["http://169.254.169.254/latest/meta-data/", "cloud metadata"],
    ["http://printer.local/", "an mDNS name"],
    ["http://localhost:3000/", "localhost"],
  ])("refuses %s (%s) without loading and without resolving", async (url) => {
    const tab = fakeTab();
    await loadGuarded(tab, url);
    expect(tab.loaded).toEqual([]);
    expect(assertPublicUrl).not.toHaveBeenCalled();
  });

  // The async half, FAIL-CLOSED: a name that resolves private, and an unexpected DNS
  // failure, must both refuse — not only an explicit "Refused …".
  it("refuses a public-looking host that resolves private", async () => {
    assertPublicUrl.mockRejectedValue(new Error("Refused private address: 10.0.0.5"));
    const tab = fakeTab();
    await loadGuarded(tab, "https://sneaky.example.com/");
    expect(tab.loaded).toEqual([]);
  });

  it("refuses on an unexpected resolution error too (fail closed, never throws)", async () => {
    assertPublicUrl.mockRejectedValue(new Error("boom"));
    const tab = fakeTab();
    await expect(loadGuarded(tab, "https://example.com/")).resolves.toBeUndefined();
    expect(tab.loaded).toEqual([]);
  });

  // `about:blank` is this process's own empty page, not an egress: loading it must not go
  // near the resolver (an empty hostname would be handed to `lookup`).
  it("loads about:blank directly, never through the resolver", async () => {
    const tab = fakeTab();
    await loadGuarded(tab, "about:blank");
    expect(tab.loaded).toEqual(["about:blank"]);
    expect(assertPublicUrl).not.toHaveBeenCalled();
  });

  it("does not load into a tab destroyed while the check was in flight", async () => {
    const tab = fakeTab(true);
    await loadGuarded(tab, "https://example.com/");
    expect(tab.loaded).toEqual([]);
  });

  // The attribution flag `navigate` sets must follow the DECISION, not the attempt.
  it("runs the onAllow hook only when the load is allowed", async () => {
    const onAllow = vi.fn();
    await loadGuarded(fakeTab(), "https://example.com/", onAllow);
    expect(onAllow).toHaveBeenCalledTimes(1);
    await loadGuarded(fakeTab(), "http://127.0.0.1/", onAllow);
    assertPublicUrl.mockRejectedValue(new Error("nope"));
    await loadGuarded(fakeTab(), "https://sneaky.example.com/", onAllow);
    expect(onAllow).toHaveBeenCalledTimes(1);
  });
});

/* The durable half: a future sink that calls `loadURL` directly would silently reopen the
   hole, because nothing in the type system says a load must be guarded. */
describe("every programmatic load in the agent process goes through the guard", () => {
  const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "agentMain.ts"), "utf8");

  it("no `loadURL` call outside `loadGuarded`, except the literal blank page", () => {
    const stray = SRC.split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, l]) => /\.loadURL\(/.test(l))
      // The guard's own call, and the `stop()` + blank-page reset of the event guard.
      .filter(([, l]) => !/target\.loadURL\(url\)/.test(l) && !/loadURL\("about:blank"\)/.test(l))
      .map(([n, l]) => `${n}: ${l.trim()}`);
    expect(stray).toEqual([]);
  });

  it("both renderer-reachable sinks route through it", () => {
    // `createTab` (tab-new / window.open) and `navigate` (the browser:navigate IPC).
    expect(SRC).toMatch(/void loadGuarded\(view\.webContents, url\)/);
    expect(SRC).toMatch(/void loadGuarded\(tab\.view\.webContents, url/);
  });
});
