import { describe, expect, it, vi } from "vitest";

// The module pulls in `electron` and the error bridge to SURFACE the failure; the predicate
// itself is pure. We cut both rather than move it into yet another file.
vi.mock("electron", () => ({ app: { quit: () => {} }, dialog: { showErrorBox: () => {} } }));
vi.mock("../runtime/errorReport", () => ({ reportMainError: () => {} }));

import { isNativeLoadFailure } from "./driver";

// A native load failure kills the process BEFORE Sentry when it happens at the
// top of a module — that's what happened on the first real Windows install: a raw
// Electron dialog, zero event. This predicate is what separates "this binary can't
// run on this machine" (terminal, to be explained) from an ordinary DB error.

describe("isNativeLoadFailure", () => {
  it("reconnaît le code que Node pose sur un dlopen refusé", () => {
    const err = Object.assign(new Error("Le module spécifié est introuvable."), {
      code: "ERR_DLOPEN_FAILED",
    });
    expect(isNativeLoadFailure(err)).toBe(true);
  });

  it("reconnaît le message même sans code — Windows le TRADUIT", () => {
    // The real message seen on the test machine was in French: relying on the
    // English text alone would see nothing outside English-language machines.
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
