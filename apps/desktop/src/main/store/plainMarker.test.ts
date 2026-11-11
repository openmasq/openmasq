import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The property: cleartext is read for a secrets store ONLY where this install wrote it in the
// clear. The keychain double seals with a prefix and THROWS on anything else, as the real one does.
const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-plainmarker-test-"));
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

import { getKey, setKey, setKeysUser } from "./keys";
import { decodeSecret, resetEncryptionProbe } from "./safeStore";
import { onPlaintextRefused, plaintextWasWritten, resetPlainMarker } from "./plainMarker";

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");
const keysFile = (uid: string): string => join(USERDATA, "accounts", `keys-${uid}.enc`);
const onDisk = (uid: string): string => Buffer.from(readFileSync(keysFile(uid), "utf8"), "base64").toString();
const keychain = (on: boolean): void => {
  encAvailable = on;
  resetEncryptionProbe();
};

beforeEach(() => {
  rmSync(join(USERDATA, "accounts"), { recursive: true, force: true });
  mkdirSync(join(USERDATA, "accounts"), { recursive: true });
  resetPlainMarker();
  keychain(true);
  setKeysUser(null);
});

describe("cleartext where a sealed store is expected", () => {
  it("a sealed key store replaced by cleartext is not read, and it is said once", () => {
    setKeysUser("victim");
    setKey("openai", "sk-REAL");
    expect(onDisk("victim").startsWith("\u0001SEALED:")).toBe(true);
    expect(plaintextWasWritten(keysFile("victim"))).toBe(false);

    const said = vi.fn();
    onPlaintextRefused(said);
    // someone who can write the folder, without the keychain, drops their own key in clear
    writeFileSync(keysFile("victim"), b64(JSON.stringify({ openai: "sk-PLANTED" })));
    setKeysUser("victim"); // a fresh read
    expect(getKey("openai")).toBeUndefined();
    expect(getKey("openai")).toBeUndefined();
    expect(said).toHaveBeenCalledTimes(1);
  });

  it("cleartext for an account that never had a store is not read either", () => {
    writeFileSync(keysFile("fresh"), b64(JSON.stringify({ openai: "sk-PLANTED" })));
    setKeysUser("fresh");
    expect(getKey("openai")).toBeUndefined();
  });

  it("a refusal before anyone listens is still said when the listener arrives", () => {
    writeFileSync(keysFile("early"), b64(JSON.stringify({ openai: "sk-PLANTED" })));
    setKeysUser("early");
    expect(getKey("openai")).toBeUndefined();
    const said = vi.fn();
    onPlaintextRefused(said);
    expect(said).toHaveBeenCalledTimes(1);
  });
});

describe("the fallback this install wrote stays its own", () => {
  it("a key written without a keychain is marked, read back, and sealed once the keychain returns", () => {
    keychain(false);
    setKeysUser("linux");
    setKey("openai", "sk-MINE");
    expect(plaintextWasWritten(keysFile("linux"))).toBe(true);
    expect(JSON.parse(onDisk("linux"))).toEqual({ openai: "sk-MINE" });

    keychain(true);
    setKeysUser("linux"); // next launch, a keyring was installed
    expect(getKey("openai")).toBe("sk-MINE");
    expect(onDisk("linux").startsWith("\u0001SEALED:")).toBe(true);
    expect(plaintextWasWritten(keysFile("linux"))).toBe(false);
  });

  it("a store from before the marker is adopted while there is no keychain, and only then", () => {
    writeFileSync(keysFile("old"), b64(JSON.stringify({ openai: "sk-OLD" })));
    keychain(false);
    setKeysUser("old");
    expect(getKey("openai")).toBe("sk-OLD");
    expect(existsSync(`${keysFile("old")}.plain`)).toBe(true);
  });
});

describe("a store of one value (decodeSecret)", () => {
  const file = join(USERDATA, "accounts", "one.enc");

  it("sealed bytes met without a keychain are never handed back as the secret", () => {
    keychain(false);
    expect(decodeSecret(Buffer.from("\u0001SEALED:passphrase"), file)).toBeNull();
    expect(plaintextWasWritten(file)).toBe(false);
  });

  it("cleartext with a keychain present and no marker is refused", () => {
    expect(decodeSecret(Buffer.from("planted passphrase"), file)).toBeNull();
  });

  it("the sealed value opens, and the marked cleartext too", () => {
    expect(decodeSecret(Buffer.from("\u0001SEALED:mine"), file)).toBe("mine");
    writeFileSync(`${file}.plain`, "");
    expect(decodeSecret(Buffer.from("written in a miss"), file)).toBe("written in a miss");
  });
});
