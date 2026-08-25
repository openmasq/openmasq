import { describe, expect, it } from "vitest";
import { activeCompetenceScope, cappedSlots, competenceLaunchText, drivesTools, promptSlots } from "./launch";

/**
 * LA SEULE RÈGLE DE COMPORTEMENT QUI RESTE DE LA FUSION :
 *
 * > une compétence qui nomme des connecteurs les utilise ; sans `servers`, rien ne change.
 *
 * C'est ce qui a permis de supprimer une liste entière sans rien perdre, donc c'est ce
 * qu'il faut épingler des deux côtés : que le champ FASSE quelque chose quand il est là,
 * et qu'il ne fasse RIEN quand il n'y est pas.
 */

describe("competenceLaunchText", () => {
  it("sans connecteur ni accolade, le prompt part NU — le comportement d'avant la fusion", () => {
    expect(competenceLaunchText({ prompt: "Résume ce texte.", servers: [] })).toBe(
      "Résume ce texte.",
    );
    expect(competenceLaunchText({ prompt: "Résume ce texte." })).toBe("Résume ce texte.");
  });

  it("avec des connecteurs, une ligne de consigne les NOMME", () => {
    const out = competenceLaunchText({ prompt: "Fais le point.", servers: ["gmail"] });
    expect(out.startsWith("Fais le point.")).toBe(true);
    expect(out).toContain("Utilise le connecteur");
  });

  it("les accolades sont expliquées AU MODÈLE, et il lui est interdit d'en inventer une", () => {
    const out = competenceLaunchText({ prompt: "Prépare ma journée du {date}.", servers: [] });
    expect(out).toContain("{date}");
    expect(out).toContain("n'invente aucune valeur");
  });
});

describe("promptSlots", () => {
  it("ordonne à la première apparition et déduplique", () => {
    expect(promptSlots("{b} puis {a} puis {b}")).toEqual(["b", "a"]);
  });
  it("une accolade vide ou multi-ligne n'en est pas une", () => {
    expect(promptSlots("const x = {};\n{\nbloc\n}")).toEqual([]);
  });
});

describe("cappedSlots — le chip ne rend jamais 20 pastilles (signalé 13/08)", () => {
  it("sous le plafond : tout est montré, rien de replié", () => {
    expect(cappedSlots(["a", "b"])).toEqual({ shown: ["a", "b"], hidden: [] });
  });
  it("au-delà : 4 montrées, le reste replié derrière « +N »", () => {
    const slots = Array.from({ length: 22 }, (_, i) => `champ${i}`);
    const { shown, hidden } = cappedSlots(slots);
    expect(shown).toHaveLength(4);
    expect(hidden).toHaveLength(18);
    expect(shown[0]).toBe("champ0"); // l'ordre d'apparition est conservé
  });
});

describe("drivesTools", () => {
  it("le CHAMP décide, jamais une étiquette", () => {
    expect(drivesTools({ servers: ["gmail"] })).toBe(true);
    expect(drivesTools({ servers: [] })).toBe(false);
    expect(drivesTools({})).toBe(false);
  });
});

describe("activeCompetenceScope", () => {
  const user = (tag?: Record<string, unknown>) => ({ role: "user", ...tag });

  it("reprend la portée de la DERNIÈRE compétence à connecteurs", () => {
    expect(
      activeCompetenceScope([
        user({ competence: { servers: ["gmail"] } }),
        user({ competence: { servers: ["gcal"] } }),
      ]),
    ).toEqual(["gcal"]);
  });

  /**
   * ⚠️ Le tour de rattrapage : une routine qui pose une question de clarification y répond
   * au tour SUIVANT, qui ne porte aucune compétence. Sans cette reprise, le routeur
   * élaguait le connecteur que la routine nomme — et le modèle se retrouvait sans outil au
   * tour exact qui en avait besoin (journal du 02/08/2026).
   */
  it("survit à un tour nu", () => {
    expect(
      activeCompetenceScope([user({ competence: { servers: ["gmail"] } }), user()]),
    ).toEqual(["gmail"]);
  });

  /**
   * ⚠️ Le contrat de l'HISTORIQUE : tout ce qui a été envoyé avant la fusion porte
   * `message.workflow`. Ne lire que la forme neuve casserait la reprise de portée de
   * toutes les conversations existantes.
   */
  it("lit l'ANCIEN tag `workflow` aussi bien que le neuf", () => {
    expect(activeCompetenceScope([user({ workflow: { servers: ["gmail"] } })])).toEqual(["gmail"]);
  });

  it("une compétence SANS connecteur passe son tour — elle ne referme pas une portée ouverte", () => {
    expect(
      activeCompetenceScope([
        user({ competence: { servers: ["gmail"] } }),
        user({ competence: {} }),
      ]),
    ).toEqual(["gmail"]);
  });

  it("aucune compétence à outils ⇒ aucune portée (les outils du tour restent ceux d'habitude)", () => {
    expect(activeCompetenceScope([user(), user({ competence: {} })])).toBeUndefined();
  });

  it("un tour de l'ASSISTANT ne définit jamais de portée", () => {
    expect(
      activeCompetenceScope([{ role: "assistant", competence: { servers: ["gmail"] } }]),
    ).toBeUndefined();
  });
});
