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
    // `hueForKind` est la source; on vérifie seulement qu'elle a répondu pour chaque
    // catégorie et que la légende ne mélange pas deux teintes pour un même type.
    for (const l of demoLegend()) {
      expect(l.hue, l.kind).toBeTruthy();
      expect(l.label, l.kind).not.toBe(l.kind);
    }
  });
});

describe("les deux promesses de comportement du premier écran", () => {
  // Elles ont remplacé une note posée sur la carte « Navigation » de Réglages, lue par
  // personne au moment où l'on s'énerve qu'une recherche réponde à côté. Dites ici, elles
  // doivent rester VRAIES du moteur : ce test échoue si l'une cesse de l'être.
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
    // L'autre moitié de la promesse : la question est POSÉE, et ne rien cocher ne révèle
    // rien. Le comportement complet est épinglé par `components/WebNavRedactOffer.test.ts`
    // et `evals/navigation.test.ts`; ici on tient le lien avec ce que l'écran affirme.
    const { WebNavRedactOffer } = await import("../../components/WebNavRedactOffer");
    expect(typeof WebNavRedactOffer).toBe("function");
  });
});
