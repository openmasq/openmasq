import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The property: a connector credential is read in the clear ONLY where this install wrote it
// so. The keychain double seals with a prefix and THROWS on anything else, as the real one does.
const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-mcpcred-test-"));
let encAvailable = true;
vi.mock("electron", () => ({
  app: { getPath: () => USERDATA },
  safeStorage: {
    isEncryptionAvailable: () => encAvailable,
    encryptString: (s: string) => Buffer.from(`\u0001SEALED:${s}`),
    decryptString: (b: Buffer) => {
      const s = b.toString();
      if (!s.startsWith("\u0001SEALED:")) throw new Error("not sealed");
      return s.slice(8);
    },
  },
}));

import { loadApiKey, loadToken, saveApiKey, saveToken, setPersistUser } from "./persist";
import { resetEncryptionProbe } from "../store/safeStore";
import { plaintextWasWritten, resetPlainMarker } from "../store/plainMarker";

const file = (uid: string): string => join(USERDATA, "accounts", `mcp-${uid}.json`);
const raw = (uid: string) => JSON.parse(readFileSync(file(uid), "utf8")) as { apiKeys: Record<string, string>; tokens: Record<string, string> };
const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v), "utf8").toString("base64");
const keychain = (on: boolean): void => {
  encAvailable = on;
  resetEncryptionProbe();
};
/** A restart on the same account: the in-memory copy forgotten, the file read again. */
const reopen = (uid: string): void => {
  setPersistUser(null);
  setPersistUser(uid);
};

beforeEach(() => {
  rmSync(join(USERDATA, "accounts"), { recursive: true, force: true });
  mkdirSync(join(USERDATA, "accounts"), { recursive: true });
  resetPlainMarker();
  keychain(true);
  setPersistUser("u1");
});

describe("connector credentials in the clear", () => {
  it("a token PLANTED as base64 JSON beside sealed ones is not taken for the user's", () => {
    saveApiKey("custom-1", "real-key");
    // someone who can write the folder, without the keychain, drops their own token in
    const r = raw("u1");
    r.tokens = { gmail: b64({ accessToken: "attacker-token" }) };
    r.apiKeys["custom-2"] = b64("attacker-key");
    writeFileSync(file("u1"), JSON.stringify(r));
    reopen("u1");
    expect(loadToken("gmail")).toBeUndefined();
    expect(loadApiKey("custom-2")).toBeUndefined();
    expect(loadApiKey("custom-1")).toBe("real-key"); // the sealed one still opens
    // refused, not erased: the entry stays for whoever wrote it
    expect(raw("u1").tokens.gmail).toBe(b64({ accessToken: "attacker-token" }));
  });

  it("what THIS install wrote without a keychain is still read once a keychain appears", () => {
    keychain(false);
    saveToken("gmail", { accessToken: "mine" });
    expect(plaintextWasWritten(file("u1"))).toBe(true);
    keychain(true);
    reopen("u1");
    expect(loadToken("gmail")).toEqual({ accessToken: "mine" });
  });

  it("an install older than the marker, still without a keychain, keeps its credentials", () => {
    writeFileSync(file("u1"), JSON.stringify({ servers: [], oauth: {}, secrets: {}, apiKeys: { c: b64("old-key") } }));
    keychain(false);
    reopen("u1");
    expect(loadApiKey("c")).toBe("old-key");
    expect(plaintextWasWritten(file("u1"))).toBe(true);
  });

  it("sealed bytes that no longer open are dropped; a keychain miss drops nothing", () => {
    saveApiKey("c", "k");
    keychain(false); // a transient miss: the sealed entry cannot be read NOW
    reopen("u1");
    expect(loadApiKey("c")).toBeUndefined();
    expect(raw("u1").apiKeys.c).toBeTruthy();
    keychain(true);
    reopen("u1");
    expect(loadApiKey("c")).toBe("k");
    // real corruption, keychain present: the entry goes
    const r = raw("u1");
    r.apiKeys.c = Buffer.from("garbage").toString("base64");
    writeFileSync(file("u1"), JSON.stringify(r));
    reopen("u1");
    expect(loadApiKey("c")).toBeUndefined();
    expect(raw("u1").apiKeys.c).toBeUndefined();
  });
});
