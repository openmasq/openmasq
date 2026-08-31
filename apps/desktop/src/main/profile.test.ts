import { describe, it, expect } from "vitest";
import { applyProfilePath, profileSuffix, type ProfileApp } from "./profile";
import type { EnvName } from "../environments";
import { BRAND } from "@openmasq/branding";

/** A fake `app` that records what's written to it — the module doesn't import Electron. */
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

/** No choice written — the case for every existing install. Injected explicitly
 *  rather than left to the real disk: a test must not depend on an ENOENT. */
const noPointer = (_base: string, fallback: EnvName): EnvName => fallback;
/** A pointer that says staging — the install of a team member who switched. */
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
    // A second process starts again from Electron's DEFAULT path, not the already
    // suffixed one — hence a fresh fake `app` here, which reproduces what a real launch does.
    const second = fakeApp(true);
    applyProfilePath(second.app, {}, stagingPointer);
    expect(second.path()).toBe(first);
    expect(first).not.toContain("(Staging) (Staging)");
  });
});

describe("profileSuffix — la pile AUTO-HÉBERGÉE ouvre son PROPRE profil", () => {
  it("custom ⇒ « (Custom) » : une adresse saisie ne relit jamais le coffre et les clés de la production", () => {
    expect(profileSuffix({ env: "custom", isPackaged: true })).toBe(" (Custom)");
    expect(profileSuffix({ env: "custom", isPackaged: false })).toBe(" (Dev)");
  });

  it("applyProfilePath suit le pointeur custom vers le dossier séparé", () => {
    const { app, path } = fakeApp(true);
    const { env } = applyProfilePath(app, {}, (): EnvName => "custom");
    expect(env).toBe("custom");
    expect(path()).toBe(`/Users/x/Library/Application Support/${BRAND.name} (Custom)`);
  });
});
