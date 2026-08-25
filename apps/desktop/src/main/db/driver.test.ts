import { describe, expect, it, vi } from "vitest";

// Le module tire `electron` et le pont d'erreurs pour SURFACER l'échec ; le prédicat, lui,
// est pur. On coupe les deux plutôt que de le déplacer dans un fichier de plus.
vi.mock("electron", () => ({ app: { quit: () => {} }, dialog: { showErrorBox: () => {} } }));
vi.mock("../runtime/errorReport", () => ({ reportMainError: () => {} }));

import { isNativeLoadFailure } from "./driver";

// Un chargement natif impossible tue le processus AVANT Sentry quand il se fait en tête de
// module — c'est ce qui est arrivé sur la première installation Windows réelle : dialogue
// Electron brut, zéro évènement. Ce prédicat est ce qui sépare « ce binaire ne peut pas
// tourner sur cette machine » (terminal, à expliquer) d'une erreur de base ordinaire.

describe("isNativeLoadFailure", () => {
  it("reconnaît le code que Node pose sur un dlopen refusé", () => {
    const err = Object.assign(new Error("Le module spécifié est introuvable."), {
      code: "ERR_DLOPEN_FAILED",
    });
    expect(isNativeLoadFailure(err)).toBe(true);
  });

  it("reconnaît le message même sans code — Windows le TRADUIT", () => {
    // Le vrai message vu sur la machine de test était en français : se fier au texte
    // anglais seul ne verrait rien hors des machines en anglais.
    expect(
      isNativeLoadFailure(new Error("\\\\?\\C:\\…\\index.node: Le module spécifié est introuvable.")),
    ).toBe(true);
    expect(
      isNativeLoadFailure(new Error("dlopen(/…/index.node): could not be found")),
    ).toBe(true);
  });

  it("laisse passer une erreur de base ORDINAIRE — sinon on quitterait sur un disque plein", () => {
    expect(isNativeLoadFailure(new Error("SQLITE_FULL: database or disk is full"))).toBe(false);
    expect(isNativeLoadFailure(new Error("no such table: conversations"))).toBe(false);
    expect(isNativeLoadFailure(Object.assign(new Error("nope"), { code: "SQLITE_BUSY" }))).toBe(false);
  });

  it("ne jette pas sur ce qui n'est pas une Error", () => {
    for (const v of [null, undefined, "boom", 42, {}]) expect(isNativeLoadFailure(v)).toBe(false);
  });
});
