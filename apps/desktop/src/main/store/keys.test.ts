import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, existsSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A throwaway userData dir. `encAvailable` is MUTABLE so a test can exercise BOTH the
// encrypted-at-rest path (keychain present) and the base64 plaintext fallback (no keyring).
// Mock BEFORE importing ./keys. `encryptString` is a spy so a test can assert it was used.
const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-keys-test-"));
let encAvailable = false;
const encryptString = vi.fn((s: string) => Buffer.from(`ENC:${s}`));
vi.mock("electron", () => ({
  app: { getPath: () => USERDATA },
  safeStorage: {
    isEncryptionAvailable: () => encAvailable,
    encryptString: (s: string) => encryptString(s),
    // Mirror of the encrypt spy: strip the ENC: prefix a genuine keychain round-trip preserves.
    decryptString: (b: Buffer) => b.toString().replace(/^ENC:/, ""),
  },
}));
vi.mock("./safeStore", () => ({
  encryptionAvailable: () => encAvailable,
  // Mirror of the real decodeEncryptedBlob (safeStore.ts) against this file's electron
  // mock: try the keychain decrypt first (strip the ENC: prefix), then plaintext; accept
  // the first candidate that parses to a JSON object, else null (undecryptable this session).
  decodeEncryptedBlob: (buf: Buffer): Record<string, string> | null => {
    const candidates: string[] = [];
    if (encAvailable) candidates.push(buf.toString().replace(/^ENC:/, ""));
    candidates.push(buf.toString("utf8"));
    for (const s of candidates) {
      try {
        const p = JSON.parse(s) as unknown;
        if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, string>;
      } catch {
        /* next candidate */
      }
    }
    return null;
  },
}));

import { setKeysUser, setKey, getKey, configuredKeys, safeUid } from "./keys";
import { BRAND } from "@openmasq/branding";

beforeEach(() => {
  encAvailable = false;
  encryptString.mockClear();
});

/* The privacy guarantee: on a shared machine, switching accounts must NEVER expose the
   previous account's provider keys (OpenAI/Gemini/…). Keys are scoped per-account. */
describe("per-account API-key isolation (account switch)", () => {
  it("account B cannot read or see account A's keys, and A's survive the round-trip", () => {
    setKeysUser("A");
    setKey("openai", "sk-AAA");
    setKey("google", "gm-AAA");
    expect(getKey("openai")).toBe("sk-AAA");
    expect(configuredKeys().sort()).toEqual(["google", "openai"]);

    // Switch to B — A's keys must be UNREACHABLE (no leak).
    setKeysUser("B");
    expect(getKey("openai")).toBeUndefined();
    expect(getKey("google")).toBeUndefined();
    expect(configuredKeys()).toEqual([]);

    // B sets its own; A's stay put.
    setKey("openai", "sk-BBB");
    expect(getKey("openai")).toBe("sk-BBB");

    // Back to A — original keys intact, B's invisible.
    setKeysUser("A");
    expect(getKey("openai")).toBe("sk-AAA");
    expect(getKey("google")).toBe("gm-AAA");

    // Each account owns a SEPARATE encrypted file.
    expect(existsSync(join(USERDATA, "accounts", "keys-A.enc"))).toBe(true);
    expect(existsSync(join(USERDATA, "accounts", "keys-B.enc"))).toBe(true);
  });

  it("signed out (uid null) exposes NO account's keys and never persists to disk", () => {
    setKeysUser(null);
    expect(getKey("openai")).toBeUndefined();
    expect(configuredKeys()).toEqual([]);
    setKey("openai", "sk-ephemeral");
    // In-memory this session only — nothing written to the legacy shared path.
    expect(existsSync(join(USERDATA, "keys.enc"))).toBe(false);
  });
});

/* At-rest property: when the OS keychain IS available, keys are ENCRYPTED, not plaintext.
   This is the regression guard the old suite lacked — deleting `encryptString` from
   `keys.ts` (storing base64 plaintext) would now turn this test RED. */
describe("encrypted at rest (keychain available)", () => {
  it("routes stored keys through safeStorage.encryptString and does NOT persist them in cleartext", () => {
    encAvailable = true;
    setKeysUser("enc-user");
    setKey("openai", "sk-SECRET-VALUE");
    // The encrypt path ran (not the base64 plaintext fallback).
    expect(encryptString).toHaveBeenCalled();
    expect(encryptString.mock.calls.some((c) => String(c[0]).includes("sk-SECRET-VALUE"))).toBe(true);
    // The on-disk file must NOT contain the raw secret in cleartext.
    const raw = readFileSync(join(USERDATA, "accounts", "keys-enc-user.enc"), "utf8");
    expect(raw).not.toContain("sk-SECRET-VALUE");
    // …but it round-trips back through the keychain decrypt.
    expect(getKey("openai")).toBe("sk-SECRET-VALUE");
  });

  /* The "keys gone after restart" report: a key written ENCRYPTED, then read while the
     keychain is briefly UNAVAILABLE, used to be read as ciphertext-as-UTF-8 → JSON.parse
     threw → the store cached {} → every key vanished for the whole session even though the
     file was intact. The fix (decodeEncryptedBlob + no-cache-on-unreadable) must (a) not
     LOSE the file, and (b) RECOVER the keys the moment the keychain is back — no restart. */
  it("does not permanently drop encrypted keys on a transient keychain miss (recovers same session)", () => {
    encAvailable = true;
    setKeysUser("blip-user");
    setKey("openai", "sk-KEEP-ME");
    // Simulate a fresh process reading cold: drop the in-memory cache (the only public
    // reset is re-scoping the account), then read with the keychain momentarily DOWN.
    setKeysUser(null);
    setKeysUser("blip-user");
    encAvailable = false;
    // Can't decrypt right now — but the read must NOT poison the cache with {}.
    expect(getKey("openai")).toBeUndefined();
    // Keychain recovers mid-session (no account switch, no restart): the key comes back.
    encAvailable = true;
    expect(getKey("openai")).toBe("sk-KEEP-ME");
  });
});

/* One-time legacy adoption: the pre-isolation shared keys.enc goes to the FIRST account
   only, the shared file is DELETED, and NO later account inherits it. */
describe("legacy adoption (maybeAdoptLegacy)", () => {
  it("only the FIRST account adopts the shared keys.enc, then the file is gone and others get nothing", () => {
    // Seed a pre-isolation shared store (base64 plaintext, keychain off).
    const legacy = join(USERDATA, "keys.enc");
    const marker = join(USERDATA, `.${BRAND.slug}-legacy-keys-adopted`);
    rmSync(join(USERDATA, "accounts"), { recursive: true, force: true });
    rmSync(marker, { force: true });
    writeFileSync(legacy, Buffer.from(JSON.stringify({ openai: "sk-LEGACY" })).toString("base64"));

    // First account to sign in adopts it.
    setKeysUser("first");
    expect(getKey("openai")).toBe("sk-LEGACY");
    expect(existsSync(join(USERDATA, "accounts", "keys-first.enc"))).toBe(true);
    // The shared secret must NOT linger on disk once adopted.
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(marker)).toBe(true);

    // A DIFFERENT account signing in later inherits NOTHING.
    setKeysUser("second");
    expect(getKey("openai")).toBeUndefined();
    expect(existsSync(join(USERDATA, "accounts", "keys-second.enc"))).toBe(false);
  });
});

/* Path-traversal hardening (audit M10): a renderer-supplied uid is sanitized to
   [A-Za-z0-9_-] so it can never escape accounts/. */
describe("safeUid path-traversal guard (audit M10)", () => {
  it("strips separators and dots so a crafted uid cannot climb out of accounts/", () => {
    expect(safeUid("../../etc/passwd")).toBe("etcpasswd");
    expect(safeUid("../../../../evil")).toBe("evil");
    expect(safeUid("a/b\\c.d")).toBe("abcd");
    expect(safeUid("good_UID-123")).toBe("good_UID-123");
    expect(safeUid("../..")).toBe(""); // all-illegal → empty → caller treats as signed-out
  });

  it("an ALL-illegal uid is treated as SIGNED OUT — never persists to a derived path", () => {
    setKeysUser("../.."); // sanitizes to "" → signed out
    setKey("openai", "sk-should-not-persist");
    expect(existsSync(join(USERDATA, "accounts", "keys-.enc"))).toBe(false);
    expect(getKey("openai")).toBe("sk-should-not-persist"); // in-memory only this session
  });

  it("a traversal-shaped uid is CONTAINED inside accounts/, never escaping it", () => {
    setKeysUser("../../../../tmp/evil"); // → "tmpevil", a safe segment (dots/slashes stripped)
    setKey("openai", "sk-contained");
    // Written ONLY as accounts/keys-tmpevil.enc — the payload cannot climb to /tmp.
    expect(existsSync(join(USERDATA, "accounts", "keys-tmpevil.enc"))).toBe(true);
    expect(existsSync(join(tmpdir(), "evil"))).toBe(false);
  });
});
