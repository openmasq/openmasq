import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Un `userData` jetable. Même montage que `keys.test.ts` (dont ce magasin copie le
// squelette) : `encAvailable` reste faux, donc on exerce le repli base64 en clair — ce qui
// permet d'INSPECTER le fichier produit, et de vérifier que l'ancien a bien disparu.
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

import { getSyncPass, setSyncPass, setSyncPassUser, clearSyncPass } from "./syncPass";
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
 * Le défaut que ce fichier ferme : la phrase E2E était à portée APPAREIL. Changer de compte
 * laissait la synchro armée avec la clé du précédent — le compte B poussait ses coffres,
 * sans l'avoir demandé, chiffrés par une clé que A a choisie et connaît.
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

  /* Déconnecté, rien ne doit atterrir sur le disque sous un nom que le compte suivant
     hériterait — et poser LÈVE, parce qu'un « enregistré » qui n'a rien enregistré est
     exactement le silence qu'on corrige par ailleurs. */
  it("déconnecté : rien à lire, et poser lève au lieu de faire semblant", () => {
    expect(getSyncPass()).toBeNull();
    expect(() => setSyncPass("x")).toThrow(/no account/);
  });

  it("un uid entièrement illégal vaut DÉCONNECTÉ, jamais un chemin dérivé", () => {
    setSyncPassUser("../../evil");
    expect(() => setSyncPass("x")).not.toThrow(); // « evil » survit à l'assainissement
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
    // Le secret partagé ne traîne plus : c'est ce qui empêche un autre compte de le lire.
    expect(existsSync(legacy())).toBe(false);
    setSyncPassUser("B");
    expect(getSyncPass()).toBeNull();
  });

  /* Sans compte résolu, l'adoption ne doit PAS courir : elle supprimerait le fichier, et
     une phrase perdue orpheline définitivement les coffres déjà synchronisés (aucun
     séquestre). Elle attend la première connexion. */
  it("déconnecté, il est PRÉSERVÉ pour la prochaine connexion", () => {
    writeFileSync(legacy(), b64("ancienne"), { mode: 0o600 });
    setSyncPassUser(null);
    expect(getSyncPass()).toBeNull();
    expect(existsSync(legacy())).toBe(true);
    setSyncPassUser("A");
    expect(getSyncPass()).toBe("ancienne");
  });
});
