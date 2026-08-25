import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";

// A throwaway userData dir (slug-prefixed, so it also exercises the tmp-prefix root).
// Mock electron BEFORE importing ./readGate so app.getPath resolves to it.
const USERDATA = mkdtempSync(join(tmpdir(), `${BRAND.slug}-readgate-test-`));
mkdirSync(join(USERDATA, "accounts"), { recursive: true });
writeFileSync(join(USERDATA, "accounts", "openmasq-x.db"), "SECRET_VAULT");
writeFileSync(join(USERDATA, "keys.enc"), "SECRET_KEYS");
writeFileSync(join(USERDATA, "note.txt"), "ok"); // a NON-secret userData file
vi.mock("electron", () => ({ app: { getPath: () => USERDATA } }));

const { grantRead, assertReadAllowed } = await import("./readGate");

describe("read-gate (audit H-1) — files:read confinement", () => {
  it("REFUSES an arbitrary un-granted path (renderer-XSS exfil floor)", () => {
    const outside = mkdtempSync(join(tmpdir(), "other-app-")); // NOT slug-prefixed
    const f = join(outside, "secret.txt");
    writeFileSync(f, "someone else's file");
    expect(() => assertReadAllowed(f)).toThrow(/chemin non autorisé/);
  });

  it("ALLOWS a path once the user granted it this session", () => {
    const outside = mkdtempSync(join(tmpdir(), "other-app-"));
    const f = join(outside, "picked.pdf");
    writeFileSync(f, "user picked this");
    expect(() => assertReadAllowed(f)).toThrow(); // ungranted first
    grantRead(f);
    expect(() => assertReadAllowed(f)).not.toThrow(); // now granted
  });

  it("ALLOWS a NON-secret file inside userData", () => {
    expect(() => assertReadAllowed(join(USERDATA, "note.txt"))).not.toThrow();
  });

  it("REFUSES the at-rest secrets even though they sit under userData (fail closed)", () => {
    // The whole userData is a read root, but these must NEVER be readable — the deny
    // check runs BEFORE the root allow, so the vault DB + keys stay unreachable.
    expect(() => assertReadAllowed(join(USERDATA, "accounts", "openmasq-x.db"))).toThrow(
      /chemin non autorisé/,
    );
    expect(() => assertReadAllowed(join(USERDATA, "keys.enc"))).toThrow(/chemin non autorisé/);
  });

  it("even a GRANT can't override the secret-deny (deny wins)", () => {
    const secret = join(USERDATA, "accounts", "openmasq-x.db");
    grantRead(secret); // a compromised renderer tries to grant then read the vault
    expect(() => assertReadAllowed(secret)).toThrow(/chemin non autorisé/);
  });
});
