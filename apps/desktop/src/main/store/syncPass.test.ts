import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A disposable `userData`. Same setup as `keys.test.ts` (whose skeleton this store
// copies): `encAvailable` stays false, so we exercise the plain-base64 fallback — which
// lets us INSPECT the produced file, and verify that the old one has indeed disappeared.
const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-syncpass-test-"));
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
  decodeEncryptedBlob: () => null,
}));

import {
  getSyncPass,
  setSyncPass,
  setSyncPassUser,
  clearSyncPass,
  getDeviceSecret,
  setDeviceSecret,
} from "./syncPass";
import { BRAND } from "@openmasq/branding";

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");
const legacy = () => join(USERDATA, "sync-pass.enc");
const marker = () => join(USERDATA, `.${BRAND.slug}-legacy-sync-pass-adopted`);

beforeEach(() => {
  encAvailable = false;
  rmSync(join(USERDATA, "accounts"), { recursive: true, force: true });
  rmSync(legacy(), { force: true });
  rmSync(marker(), { force: true });
  setSyncPassUser(null);
});

/**
 * The bug this file closes: the E2E passphrase was scoped to the DEVICE. Switching accounts
 * left sync armed with the previous key — account B would push its vaults,
 * without having asked for it, encrypted with a key A chose and knows.
 */
describe("la phrase de synchro est PAR COMPTE", () => {
  it("B ne lit jamais la phrase de A", () => {
    setSyncPassUser("A");
    setSyncPass("phrase-de-a");
    setSyncPassUser("B");
    expect(getSyncPass()).toBeNull();
  });

  it("revenir sur A la retrouve — on range, on ne détruit pas", () => {
    setSyncPassUser("A");
    setSyncPass("phrase-de-a");
    setSyncPassUser("B");
    setSyncPass("phrase-de-b");
    setSyncPassUser("A");
    expect(getSyncPass()).toBe("phrase-de-a");
  });

  it("éteindre chez B laisse A intacte", () => {
    setSyncPassUser("A");
    setSyncPass("phrase-de-a");
    setSyncPassUser("B");
    setSyncPass("phrase-de-b");
    clearSyncPass();
    expect(getSyncPass()).toBeNull();
    setSyncPassUser("A");
    expect(getSyncPass()).toBe("phrase-de-a");
  });

  /* Logged out, nothing should land on disk under a name the next account
     would inherit — and setting THROWS, because a "saved" that saved nothing is
     exactly the silence we're fixing elsewhere. */
  it("déconnecté : rien à lire, et poser lève au lieu de faire semblant", () => {
    expect(getSyncPass()).toBeNull();
    expect(() => setSyncPass("x")).toThrow(/no account/);
  });

  it("un uid entièrement illégal vaut DÉCONNECTÉ, jamais un chemin dérivé", () => {
    setSyncPassUser("../../evil");
    expect(() => setSyncPass("x")).not.toThrow(); // "evil" survives sanitization
    setSyncPassUser("...");
    expect(getSyncPass()).toBeNull();
    expect(() => setSyncPass("x")).toThrow(/no account/);
  });
});

describe("l'ancien fichier partagé", () => {
  it("revient au PREMIER compte connecté, puis DISPARAÎT du disque", () => {
    writeFileSync(legacy(), b64("ancienne"), { mode: 0o600 });
    setSyncPassUser("A");
    expect(getSyncPass()).toBe("ancienne");
    // The shared secret no longer lingers: that's what stops another account from reading it.
    expect(existsSync(legacy())).toBe(false);
    setSyncPassUser("B");
    expect(getSyncPass()).toBeNull();
  });

  /* With no account resolved, adoption must NOT run: it would delete the file, and
     a lost passphrase permanently orphans the vaults already synced (no
     escrow). It waits for the first sign-in. */
  it("déconnecté, il est PRÉSERVÉ pour la prochaine connexion", () => {
    writeFileSync(legacy(), b64("ancienne"), { mode: 0o600 });
    setSyncPassUser(null);
    expect(getSyncPass()).toBeNull();
    expect(existsSync(legacy())).toBe(true);
    setSyncPassUser("A");
    expect(getSyncPass()).toBe("ancienne");
  });
});

/* `OPENMASQ_REQUIRE_DB_ENCRYPTION=1` means it for BOTH sync secrets. The regression was in
   the shared skeleton (`secretFile.ts`): `assertPlaintextAllowed` threw inside a try whose
   catch only logged, so the device secret was silently not written while the caller was told
   it was — `store/atRestPolicy.ts` requires the refusal to reach the caller. */
describe("mode strict au repos : on refuse, on ne fait pas semblant", () => {
  const before = process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;
  afterEach(() => {
    if (before === undefined) delete process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION;
    else process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = before;
  });

  it("le secret d'appareil lève et ne laisse rien sur le disque", () => {
    encAvailable = false;
    process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = "1";
    expect(() => setDeviceSecret("appareil-en-clair")).toThrow(/refusing to persist/);
    expect(existsSync(join(USERDATA, "sync-device-secret.enc"))).toBe(false);
    expect(getDeviceSecret()).toBeNull();
  });

  it("la phrase par compte lève aussi, et rien n'est écrit sous le compte", () => {
    encAvailable = false;
    process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION = "1";
    setSyncPassUser("strict");
    expect(() => setSyncPass("phrase-en-clair")).toThrow(/refusing to persist/);
    expect(existsSync(join(USERDATA, "accounts", "sync-pass-strict.enc"))).toBe(false);
    expect(getSyncPass()).toBeNull();
  });
});
