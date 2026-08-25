import { describe, it, expect } from "vitest";
import { applyProfilePath, profileSuffix, type ProfileApp } from "./profile";
import type { EnvName } from "../environments";
import { BRAND } from "@openmasq/branding";

/** Un faux `app` qui note ce qu'on lui écrit — le module n'importe pas Electron. */
function fakeApp(isPackaged: boolean, base = `/Users/x/Library/Application Support/${BRAND.name}`) {
  let userData = base;
  const app: ProfileApp = {
    isPackaged,
    getPath: () => userData,
    setPath: (_n, p) => {
      userData = p;
    },
  };
  return { app, path: () => userData };
}

/** Aucun choix écrit — le cas de toutes les installs existantes. Injecté explicitement
 *  plutôt que laissé au vrai disque : un test ne doit pas dépendre d'un ENOENT. */
const noPointer = (_base: string, fallback: EnvName): EnvName => fallback;
/** Un pointeur qui dit staging — l'install d'un membre de l'équipe qui a basculé. */
const stagingPointer = (): EnvName => "staging";

describe("profileSuffix — quel profil userData une instance ouvre", () => {
  it("⛔ la PRODUCTION garde le chemin nu — la suffixer viderait toutes les installs existantes", () => {
    expect(profileSuffix({ env: "production", isPackaged: true })).toBe("");
  });

  it("staging se sépare : sans ça, basculer vers la production lui fait ouvrir le coffre et les clés de staging", () => {
    expect(profileSuffix({ env: "staging", isPackaged: true })).toBe(" (Staging)");
  });

  it("le dev l'emporte sur l'environnement — il pointe déjà sur localhost, et il doit surtout ne pas partager le verrou d'une install", () => {
    expect(profileSuffix({ env: "staging", isPackaged: false })).toBe(" (Dev)");
    expect(profileSuffix({ env: "production", isPackaged: false })).toBe(" (Dev)");
  });
});

describe("applyProfilePath — ce qui est réellement écrit dans `userData`", () => {
  it("⛔ sans pointeur, TOUTE install ouvre le profil de production, quel que soit son canal — l'environnement ne se déduit plus du build", () => {
    const { app, path } = fakeApp(true);
    const before = path();
    const { env } = applyProfilePath(app, {}, noPointer);
    expect(env).toBe("production");
    expect(path()).toBe(before);
  });

  it("un pointeur staging ouvre le dossier séparé", () => {
    const { app, path } = fakeApp(true);
    const { env } = applyProfilePath(app, {}, stagingPointer);
    expect(env).toBe("staging");
    expect(path()).toBe(`/Users/x/Library/Application Support/${BRAND.name} (Staging)`);
  });

  it("le crochet e2e l'emporte sur le dossier — pas sur l'environnement", () => {
    const { app, path } = fakeApp(true);
    const { env } = applyProfilePath(app, { OPENMASQ_USER_DATA_DIR: "/tmp/profil-jetable" }, stagingPointer);
    expect(path()).toBe("/tmp/profil-jetable");
    expect(env).toBe("staging");
  });

  it("le dossier de BASE rendu est celui d'AVANT le suffixe — c'est là que vit le pointeur", () => {
    const { app } = fakeApp(true);
    const { baseUserData } = applyProfilePath(app, {}, stagingPointer);
    expect(baseUserData).toBe(`/Users/x/Library/Application Support/${BRAND.name}`);
  });

  it("le suffixe ne s'empile pas : deux lancements successifs donnent le MÊME dossier", () => {
    const { app, path } = fakeApp(true);
    applyProfilePath(app, {}, stagingPointer);
    const first = path();
    // Un second processus repart du chemin PAR DÉFAUT d'Electron, pas du chemin déjà
    // suffixé — d'où un faux `app` neuf ici, qui reproduit ce que fait un vrai lancement.
    const second = fakeApp(true);
    applyProfilePath(second.app, {}, stagingPointer);
    expect(second.path()).toBe(first);
    expect(first).not.toContain("(Staging) (Staging)");
  });
});
