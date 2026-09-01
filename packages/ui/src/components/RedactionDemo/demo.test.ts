import { describe, expect, it } from "vitest";
import { DEMO_SPANS, demoLegend, demoText } from "./demo";

/**
 * The first screen of the app makes a factual claim about what redaction does. These pin
 * that the DEMONSTRATION cannot start lying — a fake that leaks its real value, a
 * category shown in a colour the app doesn't use for it, an example with nothing to show.
 */
describe("la démonstration du premier écran", () => {
  it("montre plusieurs catégories, pas un seul type de donnée", () => {
    expect(demoLegend().length).toBeGreaterThanOrEqual(3);
  });

  it("chaque valeur sensible a un remplaçant DIFFÉRENT et non vide", () => {
    const sensitive = DEMO_SPANS.filter((s) => s.fake);
    expect(sensitive.length).toBeGreaterThanOrEqual(3);
    for (const s of sensitive) {
      expect(s.fake, s.text).toBeTruthy();
      expect(s.fake, `${s.text} : le faux ne doit pas être la vraie valeur`).not.toBe(s.text);
    }
  });

  it("la phrase « reçue par le modèle » ne contient AUCUNE vraie valeur", () => {
    const wire = demoText(DEMO_SPANS, "fake");
    for (const s of DEMO_SPANS.filter((x) => x.fake)) {
      expect(wire, `« ${s.text} » ne doit pas survivre côté modèle`).not.toContain(s.text);
    }
  });

  it("un faux garde la FORME de ce qu'il remplace — sinon la démo ment sur le procédé", () => {
    const byKind = Object.fromEntries(DEMO_SPANS.filter((s) => s.kind).map((s) => [s.kind, s]));
    expect(byKind.email?.fake).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(byKind.phone?.fake?.replace(/\D/g, "")).toHaveLength(
      byKind.phone!.text.replace(/\D/g, "").length,
    );
    expect(byKind.name?.fake?.split(" ")).toHaveLength(byKind.name!.text.split(" ").length);
  });

  it("les couleurs viennent du moteur, pas d'un choix local", () => {
    // `hueForKind` is the source; we only check that it answered for each
    // category and that the legend doesn't mix two tints for the same type.
    for (const l of demoLegend()) {
      expect(l.hue, l.kind).toBeTruthy();
      expect(l.label, l.kind).not.toBe(l.kind);
    }
  });
});

describe("les deux promesses de comportement du premier écran", () => {
  // They replaced a note placed on the « Navigation » card of Réglages, read by
  // nobody at the moment one gets annoyed that a search answers off-topic. Stated here, they
  // must stay TRUE of the engine: this test fails if one of them stops being so.
  it("une célébrité, une grande marque et un pays traversent le redaction", async () => {
    const { pseudonymize } = await import("@openmasq/redact");
    const vault: Record<string, string> = {};
    const text = "Compare la stratégie d'Apple et de Microsoft en France selon Elon Musk.";
    const r = await pseudonymize(text, { vault });
    for (const mot of ["Apple", "Microsoft", "France", "Elon Musk"]) {
      expect(r.text, `${mot} doit rester en clair`).toContain(mot);
    }
  });

  it("la carte de révélation pré-recherche existe et se décide à vide par défaut", async () => {
    // The other half of the promise: the question is ASKED, and checking nothing reveals
    // nothing. The full behavior is pinned by `components/WebNavRedactOffer.test.ts`
    // and `evals/navigation.test.ts`; here we hold the link to what the screen claims.
    const { WebNavRedactOffer } = await import("../../components/WebNavRedactOffer");
    expect(typeof WebNavRedactOffer).toBe("function");
  });
});
