import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A disposable `userData`, same skeleton as `keys.test.ts`. `encAvailable` stays false so we
// exercise the no-keychain path — the only one where the at-rest policy has anything to say.
const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-authstore-test-"));
let encAvailable = false;
vi.mock("electron", () => ({
  app: { getPath: () => USERDATA },
  safeStorage: {
    isEncryptionAvailable: () => encAvailable,
    encryptString: (s: string) => Buffer.from(`ENC:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^ENC:/, ""),
  },
}));
vi.mock("./safeStore", () => ({
  encryptionAvailable: () => encAvailable,
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

import { authStoreGet, authStoreSet } from "./authStore";

const file = () => join(USERDATA, "auth.enc");

beforeEach(() => {
  encAvailable = false;
  rmSync(file(), { force: true });
});

/* The refresh token is persistent account access, so `OPENMASQ_REQUIRE_DB_ENCRYPTION=1` has
   to mean it here too. The regression: `assertPlaintextAllowed` threw inside a try whose catch
   only console.error'd, and `cache = map` had already run — Supabase then read the session
   back from memory for the whole session while nothing was on disk, and the operator's
   refusal had been reduced to a log line. `store/atRestPolicy.ts` states the contract. */
describe("strict at-rest refuses to store the Supabase session", () => {
  const before = process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;
  afterEach(() => {
    if (before === undefined) delete process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;
    else process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = before;
  });

  it("throws, writes no file, and the cache does not serve the token back", () => {
    process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = "1";
    expect(() => authStoreSet("sb-strict-auth-token", "refresh-MUST-NOT-PERSIST")).toThrow(
      /refusing to persist/,
    );
    expect(existsSync(file())).toBe(false);
    expect(authStoreGet("sb-strict-auth-token")).toBeNull();
  });

  it("still falls back to base64 by default — availability over confidentiality", () => {
    delete process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;
    authStoreSet("sb-ref-auth-token", "refresh-ok");
    expect(existsSync(file())).toBe(true);
    expect(authStoreGet("sb-ref-auth-token")).toBe("refresh-ok");
  });
});
