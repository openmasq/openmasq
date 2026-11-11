import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({ BrowserWindow: class {}, app: { on: () => {}, getPath: () => tmpdir() } }));

import { initPostureSeal, markAdopted, postureAdopted, postureTag, postureVerdict, type PostureKeyStore } from "./postureSeal";
import { _resetConfirmationMode, getConfirmationMode, initConfirmationMode, setConfirmationMode } from "./confirmationMode";
import { sealSpec, vetSpecs } from "./specSeal";
import type { ServerSpec } from "./persist";

/** The key file, in memory: what the keychain-sealed file holds, and whether it can be read. */
function keyStore() {
  const s = { text: null as string | null, locked: false, writes: 0 };
  const store: PostureKeyStore = {
    read: () => (s.locked ? null : s.text),
    write: (t) => {
      s.text = t;
      s.writes++;
    },
    exists: () => s.text !== null,
  };
  return { s, store };
}

let dir: string;
let keys: ReturnType<typeof keyStore>;
const modeFile = () => join(dir, "confirmation-mode.json");
/** A restart: memory forgotten, the same files and the same key. */
const restart = () => {
  _resetConfirmationMode();
  initPostureSeal(keys.store);
  initConfirmationMode(dir);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "posture-"));
  keys = keyStore();
  restart();
  return () => {
    initPostureSeal(null);
    _resetConfirmationMode();
    rmSync(dir, { recursive: true, force: true });
  };
});

describe("postureSeal — a tag only this install can make", () => {
  it("the same value makes the same tag, whatever the key order; another value or kind does not", () => {
    const a = postureTag("k", { url: "https://a", params: { dirs: ["/x", "/y"] } });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(postureTag("k", { params: { dirs: ["/x", "/y"] }, url: "https://a" })).toBe(a);
    expect(postureTag("k", { url: "https://b", params: { dirs: ["/x", "/y"] } })).not.toBe(a);
    expect(postureTag("other", { url: "https://a", params: { dirs: ["/x", "/y"] } })).not.toBe(a);
  });

  it("a store is adopted once; after that a missing or foreign tag is bad", () => {
    expect(postureVerdict("s", "k", "v", undefined)).toBe("adopt");
    markAdopted("s");
    expect(postureAdopted("s")).toBe(true);
    expect(postureVerdict("s", "k", "v", undefined)).toBe("bad");
    expect(postureVerdict("s", "k", "v", "0".repeat(64))).toBe("bad");
    expect(postureVerdict("s", "k", "v", postureTag("k", "v"))).toBe("ok");
    // the adoption is written in the SEALED key file: it survives a restart
    initPostureSeal(keys.store);
    expect(postureVerdict("s", "k", "v", undefined)).toBe("bad");
  });

  it("a key that is there but cannot be read verifies nothing, and is never replaced", () => {
    markAdopted("s");
    const tag = postureTag("k", "v");
    keys.s.locked = true;
    initPostureSeal(keys.store);
    const writes = keys.s.writes;
    expect(postureVerdict("s", "k", "v", tag)).toBe("bad");
    expect(postureTag("k", "v")).toBeNull();
    expect(keys.s.writes).toBe(writes); // a new key would orphan every tag
  });

  it("not wired: the callers keep their plain behaviour", () => {
    initPostureSeal(null);
    expect(postureVerdict("s", "k", "v", undefined)).toBe("off");
    expect(postureTag("k", "v")).toBeNull();
  });
});

describe("the confirmation mode on disk is the user's, or it is the strictest", () => {
  it("an install from before the tag keeps the mode it had, and gets it sealed", () => {
    writeFileSync(modeFile(), JSON.stringify({ mode: "standard" }));
    restart();
    expect(getConfirmationMode()).toBe("standard");
    expect(JSON.parse(readFileSync(modeFile(), "utf-8")).tag).toMatch(/^[0-9a-f]{64}$/);
  });

  it("renforce flipped to standard by hand reads renforce", async () => {
    await setConfirmationMode("renforce", async () => true);
    const genuine = JSON.parse(readFileSync(modeFile(), "utf-8"));
    writeFileSync(modeFile(), JSON.stringify({ ...genuine, mode: "standard" }));
    restart();
    expect(getConfirmationMode()).toBe("renforce");
  });

  it("the file erased, or its tag stripped, reads renforce once the store is sealed", async () => {
    expect(getConfirmationMode()).toBe("standard"); // a fresh install: adopted as standard
    rmSync(modeFile());
    restart();
    expect(getConfirmationMode()).toBe("renforce");
    writeFileSync(modeFile(), JSON.stringify({ mode: "standard" }));
    restart();
    expect(getConfirmationMode()).toBe("renforce");
  });

  it("the user's own choice on the window is written with its tag and read back", async () => {
    await setConfirmationMode("renforce", async () => true);
    await setConfirmationMode("standard", async () => true); // the click on main's window
    restart();
    expect(getConfirmationMode()).toBe("standard");
  });

  it("a locked keychain reads strict rather than trusting the file", async () => {
    expect(getConfirmationMode()).toBe("standard");
    keys.s.locked = true;
    restart();
    expect(getConfirmationMode()).toBe("renforce");
  });
});

describe("a connector's address and folders are the app's, or they are withheld", () => {
  const custom: ServerSpec = { id: "custom-1", name: "Mine", kind: "http", url: "https://mcp.example/mcp" };
  const files: ServerSpec = { id: "filesystem", name: "Fichiers", kind: "stdio", catalogId: "filesystem", params: { dirs: ["/Users/a/Documents"] } };

  it("a store from before the tag is sealed as it stands, once", () => {
    const first = vetSpecs("mcp-u1", [custom, files], {});
    expect(first.servers).toEqual([custom, files]);
    expect(Object.keys(first.seals ?? {})).toEqual(["custom-1", "filesystem"]);
    // the tags stripped from the file afterwards do not make it new again
    const again = vetSpecs("mcp-u1", [custom], {});
    expect(again.seals).toBeUndefined();
    expect(again.servers[0]).toMatchObject({ altered: true, url: undefined });
  });

  it("a server pointed elsewhere on disk loses its address: its token goes nowhere", () => {
    const { seals } = vetSpecs("mcp-u1", [custom, files], {});
    const moved = { ...custom, url: "https://evil.example/mcp" };
    const [spec] = vetSpecs("mcp-u1", [moved], seals!).servers;
    expect(spec).toMatchObject({ id: "custom-1", altered: true });
    expect(spec.url).toBeUndefined();
  });

  it("folders widened on disk are not granted", () => {
    const { seals } = vetSpecs("mcp-u1", [files], {});
    const widened = { ...files, params: { dirs: ["/Users/a"] } };
    const [spec] = vetSpecs("mcp-u1", [widened], seals!).servers;
    expect(spec.altered).toBe(true);
    expect(spec.params).toBeUndefined();
  });

  it("what the app wrote verifies; a label it rewrote changes nothing", () => {
    vetSpecs("mcp-u1", [], {});
    const seals = { "custom-1": sealSpec(custom)! };
    expect(vetSpecs("mcp-u1", [{ ...custom, label: "work" }], seals).servers[0].altered).toBeUndefined();
  });

  it("one account's tag does not carry a spec with another id", () => {
    vetSpecs("mcp-u1", [], {});
    const seals = { "custom-2": sealSpec(custom)! };
    expect(vetSpecs("mcp-u1", [{ ...custom, id: "custom-2" }], seals).servers[0].altered).toBe(true);
  });

  it("signed out (memory only) and not wired: nothing to verify", () => {
    expect(vetSpecs(null, [custom], {}).servers).toEqual([custom]);
    initPostureSeal(null);
    expect(vetSpecs("mcp-u1", [custom], {}).servers).toEqual([custom]);
  });
});
