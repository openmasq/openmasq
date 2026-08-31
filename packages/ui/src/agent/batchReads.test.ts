import { describe, expect, it } from "vitest";
import {
  advanceSoloRead,
  shouldNudgeBatch,
  batchReadNudge,
  BATCH_READ_NUDGE_AT,
} from "./batchReads";

const one = (name: string) => [{ name }];

describe("advanceSoloRead — reconnaître la lecture cible par cible", () => {
  it("compte les tours consécutifs sur le MÊME outil, seul", () => {
    // The reported sequence: eight `slack__read_channel`, one per turn.
    let s = advanceSoloRead(null, one("slack__read_channel"));
    expect(s).toEqual({ tool: "slack__read_channel", count: 1 });
    s = advanceSoloRead(s, one("slack__read_channel"));
    expect(s).toEqual({ tool: "slack__read_channel", count: 2 });
  });

  it("le silence déjà accordé SUIT la série, et meurt avec elle", () => {
    const told = advanceSoloRead({ tool: "a", count: 2, told: true }, one("a"));
    expect(told).toEqual({ tool: "a", count: 3, told: true });
    // A new streak starts clean: it deserves its own note.
    expect(advanceSoloRead(told, one("b"))).toEqual({ tool: "b", count: 1 });
  });

  it("un AUTRE outil repart de un — la série porte sur un outil", () => {
    const s = advanceSoloRead(advanceSoloRead(null, one("a")), one("b"));
    expect(s).toEqual({ tool: "b", count: 1 });
  });

  it("un tour qui GROUPE déjà casse la série — c'est ce qu'on cherchait", () => {
    const s = advanceSoloRead(null, one("slack__read_channel"));
    expect(advanceSoloRead(s, [{ name: "a" }, { name: "b" }])).toBeNull();
  });

  it("un tour sans appel casse la série aussi", () => {
    expect(advanceSoloRead({ tool: "a", count: 3 }, [])).toBeNull();
  });
});

describe("shouldNudgeBatch — dire une fois, au bon moment", () => {
  it("se tait au premier appel : rien ne prouve encore une série", () => {
    expect(shouldNudgeBatch({ tool: "a", count: 1 })).toBe(false);
  });

  it("parle dès que la série est établie", () => {
    expect(shouldNudgeBatch({ tool: "a", count: BATCH_READ_NUDGE_AT })).toBe(true);
    expect(shouldNudgeBatch({ tool: "a", count: 7 })).toBe(true);
  });

  it("ne le répète pas — un modèle qui a ignoré la note ne cédera pas à sa redite", () => {
    expect(shouldNudgeBatch({ tool: "a", count: 5, told: true })).toBe(false);
  });

  it("sans série, rien", () => {
    expect(shouldNudgeBatch(null)).toBe(false);
  });
});

describe("batchReadNudge — ce que le modèle lit", () => {
  it("nomme l'outil, le compte, et demande le groupage", () => {
    const n = batchReadNudge("slack__read_channel", 3);
    expect(n).toContain("`slack__read_channel`");
    expect(n).toContain("3 fois de suite");
    expect(n).toContain("ENSEMBLE");
    expect(n).toContain("parallèle");
  });

  it("ne porte AUCUNE valeur d'argument — il part sur le fil", () => {
    // It joins a tool result that's already redacted; it must not add anything new to it.
    expect(batchReadNudge("slack__read_channel", 3)).not.toMatch(/\{|"channel"|C0[A-Z0-9]/);
  });
});
