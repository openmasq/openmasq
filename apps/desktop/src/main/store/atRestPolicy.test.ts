// `OPENMASQ_REQUIRE_DB_ENCRYPTION=1` has to mean it for everything at rest.
//
// The regression: the flag was honoured by `dbCrypto` alone. The conversation store
// refused to open unencrypted while, in the same directory, the provider API keys, the
// connector OAuth tokens, the sync passphrase and the device secret went on being written
// as base64 — the credentials that reach every connected account, and the passphrase that
// decrypts every other device on it.
//
// The second case is the durable one: it reads the write paths and fails if a store learns
// to fall back to plaintext without asking the policy first.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { strictAtRest, assertPlaintextAllowed } from "./atRestPolicy";

const MAIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const before = process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;

afterEach(() => {
  if (before === undefined) delete process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;
  else process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = before;
});

describe("the at-rest policy", () => {
  it("lets a store fall back by default — availability over confidentiality, deliberately", () => {
    delete process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;
    expect(strictAtRest()).toBe(false);
    expect(() => assertPlaintextAllowed("provider API keys")).not.toThrow();
  });

  it("refuses in strict mode, and names what it refused to write", () => {
    process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = "1";
    expect(strictAtRest()).toBe(true);
    expect(() => assertPlaintextAllowed("provider API keys")).toThrow(/provider API keys/);
    expect(() => assertPlaintextAllowed("x")).toThrow(/refusing to persist it in cleartext/);
  });

  it("is not armed by any other value", () => {
    for (const v of ["0", "true", "", "yes"]) {
      process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = v;
      expect(strictAtRest()).toBe(false);
    }
  });
});

describe("every store that can write a secret in cleartext asks the policy first", () => {
  // Each entry: the file, and the phrase its plaintext fallback logs. A store that keeps
  // the warning but drops the policy call fails here.
  const STORES: [string, string][] = [
    ["store/keys.ts", "storing API keys unencrypted"],
    ["store/secretFile.ts", "unencrypted"],
    ["mcp/persist.ts", "storing credentials unencrypted"],
  ];

  for (const [rel, warning] of STORES) {
    it(`${rel} gates its plaintext fallback`, () => {
      const src = readFileSync(join(MAIN, rel), "utf8");
      expect(src).toContain(warning); // the fallback still exists (default behaviour)
      expect(src).toContain("assertPlaintextAllowed"); // and it is gated
    });
  }

  it("dbCrypto keeps its own refusal (it predates the shared policy)", () => {
    const src = readFileSync(join(MAIN, "store/dbCrypto.ts"), "utf8");
    expect(src).toContain("OPENMASQ_REQUIRE_DB_ENCRYPTION");
  });
});
