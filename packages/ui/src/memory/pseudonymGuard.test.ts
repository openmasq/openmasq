import { describe, it, expect } from "vitest";
import { resolveExtraction } from "./extract";
import type { Extraction } from "./extractParse";

const fact = (entity: string, alias?: string): Extraction => ({
  facts: [{ entity, alias, cat: "autre", fact: "La composition actuelle." } as never],
});
const REAL = "Retiens la composition du gouvernement français.";
const WIRE = "Retiens la composition de Verdanta Industries.";

describe("un PSEUDONYME ne devient jamais une fiche mémoire", () => {
  it("le résout quand le vault le connaît", () => {
    const out = resolveExtraction(fact("Verdanta Industries"), { "Verdanta Industries": "gouvernement français" }, REAL, { allowNotes: true, wireText: WIRE });
    expect(out.facts[0]?.entity).toBe("gouvernement français");
  });

  it("le REFUSE quand le vault ne l'a pas — au lieu d'en faire une note", () => {
    // The measured case: vault not hydrated ⇒ the « Verdanta Industries » card (the fake for
    // « gouvernement français ») used to enter memory, the real value relegated to an alias.
    const out = resolveExtraction(fact("Verdanta Industries", "gouvernement francais"), {}, REAL, { allowNotes: true, wireText: WIRE });
    expect(out.facts).toEqual([]);
  });

  it("laisse passer un titre de note VRAIMENT inventé (absent des DEUX textes)", () => {
    // A summary the model composes itself: neither in the real text, nor in the wire.
    const out = resolveExtraction(fact("Liste ministérielle 2026"), {}, REAL, { allowNotes: true, wireText: WIRE });
    expect(out.facts[0]?.entity).toBe("Liste ministérielle 2026");
    expect(out.facts[0]?.note).toBe(true);
  });

  it("une entité ancrée dans le texte RÉEL reste une vraie fiche, pas une note", () => {
    const out = resolveExtraction(fact("gouvernement français"), {}, REAL, { allowNotes: true, wireText: WIRE });
    expect(out.facts[0]?.entity).toBe("gouvernement français");
    expect(out.facts[0]?.note).toBeUndefined();
  });

  it("sans wireText la garde est inerte (comportement inchangé)", () => {
    const out = resolveExtraction(fact("Verdanta Industries"), {}, REAL, { allowNotes: true });
    expect(out.facts[0]?.entity).toBe("Verdanta Industries");
  });

  it("un ALIAS venu du wire est refusé sans perdre le fait", () => {
    const out = resolveExtraction(
      { facts: [{ entity: "gouvernement français", alias: "Verdanta Industries", cat: "autre", fact: "x" } as never] },
      {}, REAL, { allowNotes: true, wireText: WIRE },
    );
    expect(out.facts[0]?.entity).toBe("gouvernement français");
    expect(out.facts[0]?.alias).toBeUndefined();
  });
});
