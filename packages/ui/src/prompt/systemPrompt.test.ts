import { describe, it, expect } from "vitest";
import { withToolGuidance } from "../agent/mcpAgentGuidance";
import { buildSystemContent } from "../send/buildWire";
import { datePreamble, LANGUAGE_GUIDANCE, LANGUAGE_REMINDER, DOCUMENT_GUIDANCE, PRODUCT_GROUNDING } from "./systemPrompt";

describe("datePreamble", () => {
  const d = new Date(2026, 6, 12, 15, 0, 0); // 12 Jul 2026, local

  it("states today's date in human + ISO form (local, not UTC)", () => {
    const s = datePreamble(d);
    expect(s).toContain("2026-07-12");
    expect(s).toContain("2026"); // human form also carries the year
    expect(s.toLowerCase()).toContain("juillet");
  });

  it("frames the date as the PRESENT and forbids the future-refusal", () => {
    const s = datePreamble(d).toLowerCase();
    expect(s).toContain("présent");
    expect(s).toContain("n'est pas dans le futur");
    expect(s).toContain("dans le futur"); // the "ne refuse jamais … futur" clause
  });

  it("nudges to browse/search when tools are available", () => {
    const s = datePreamble(d).toLowerCase();
    expect(s).toContain("navigation");
    expect(s).toContain("recherche web");
  });

  it("pads single-digit month/day in the ISO date", () => {
    // 3 Feb 2026 → 2026-02-03 (both zero-padded)
    expect(datePreamble(new Date(2026, 1, 3, 9))).toContain("2026-02-03");
  });
});

describe("LANGUAGE_GUIDANCE — la réflexion aussi est affichée", () => {
  it("gouverne la RÉPONSE et le RAISONNEMENT, pas seulement la réponse", () => {
    // La règle ne parlait que de « la réponse » : le modèle répondait en français et
    // raisonnait en anglais — sous « Réflexion », en pleine conversation française.
    expect(LANGUAGE_GUIDANCE).toMatch(/LANGUE du message de l'utilisateur/);
    expect(LANGUAGE_GUIDANCE).toMatch(/thinking|chaîne de pensée/);
    expect(LANGUAGE_GUIDANCE).toMatch(/pas en anglais/);
  });

  it("DIT pourquoi — un modèle ne peut pas deviner que sa réflexion est montrée", () => {
    expect(LANGUAGE_GUIDANCE).toMatch(/AFFICHÉ/);
  });

  it("le rappel dit la MÊME chose que la règle — sinon c'est une seconde source", () => {
    // `LANGUAGE_REMINDER` est un écho volontaire (récence), pas une variante : les deux
    // doivent gouverner la réponse ET la réflexion, et nommer l'anglais comme le travers
    // à éviter. Le jour où l'une change sans l'autre, ce test tombe.
    for (const s of [LANGUAGE_GUIDANCE, LANGUAGE_REMINDER]) {
      expect(s).toMatch(/langue du message de l'utilisateur/i);
      expect(s).toMatch(/thinking|chaîne de pensée|réflexion/i);
      expect(s).toMatch(/anglais/i);
    }
  });

  it("sur un tour AGENTIQUE la règle finit le message système, elle n'y est pas juste présente", () => {
    // Le vrai symptôme n'était pas une règle absente, c'était une règle ENSEVELIE :
    // `withToolGuidance` append des milliers de caractères d'outillage derrière elle, et
    // le modèle lit en dernier une page sur le navigateur. Ce test mesure la QUEUE.
    const base = buildSystemContent((s) => ({ text: s }), undefined, false);
    const sys = String(
      withToolGuidance(
        [{ role: "system", content: base }, { role: "user", content: "Quelle actualité aujourd'hui ?" }],
        "gmail, notion, filesystem",
        true,
        "\n\nBLOC SUGGEST",
        true,
        true,
      )[0].content,
    );

    // La règle de fond est toujours là (elle gouverne aussi le chemin non-agentique)…
    expect(sys).toContain(LANGUAGE_GUIDANCE);
    // …mais ce que le modèle lit EN DERNIER, avant le tour de l'utilisateur, c'est le rappel.
    expect(sys.trimEnd().endsWith(LANGUAGE_REMINDER)).toBe(true);
    // Et la consigne d'outillage, elle, ne doit plus être le dernier mot.
    expect(sys.trimEnd().endsWith("BLOC SUGGEST")).toBe(false);
  });
});

describe("DOCUMENT_GUIDANCE — la moitié design", () => {
  it("garde le contrat du bloc : la balise, le titre, le refus du bavardage", () => {
    expect(DOCUMENT_GUIDANCE).toContain("```document");
    expect(DOCUMENT_GUIDANCE).toMatch(/# …/);
    expect(DOCUMENT_GUIDANCE).toMatch(/jamais pour une/i);
  });

  it("dicte une structure PAR TYPE — lettre, rapport, note", () => {
    expect(DOCUMENT_GUIDANCE).toMatch(/LETTRE.*signature/is);
    expect(DOCUMENT_GUIDANCE).toMatch(/RAPPORT.*chapeau/is);
    expect(DOCUMENT_GUIDANCE).toMatch(/NOTE.*conclusion en premier/is);
  });

  it("interdit exactement ce que l'app dégrade — pas du goût, la grammaire rendue", () => {
    // L'éditeur de la carte ne rend NI les titres de niveau 4+ NI les listes
    // imbriquées (ils retombent en texte littéral) : les interdire au modèle est un
    // fait de rendu, et le test tombe si l'instruction perd l'interdit.
    expect(DOCUMENT_GUIDANCE).toMatch(/niveau 4\+/);
    expect(DOCUMENT_GUIDANCE).toMatch(/liste imbriquée/);
    expect(DOCUMENT_GUIDANCE).toMatch(/tableau Markdown/);
  });

  it("demande la typographie française — dont l'espace que la micro-typo saura souder", () => {
    // `microTypography.ts` ne fait que REMPLACER une espace existante par une
    // insécable : si le modèle n'écrit pas l'espace avant « : ; ! ? », il n'y a rien
    // à souder. L'instruction et le module forment une paire.
    expect(DOCUMENT_GUIDANCE).toMatch(/espace avant/i);
    expect(DOCUMENT_GUIDANCE).toContain("12 000");
  });

  it("reste courte — elle voyage dans CHAQUE message système", () => {
    expect(DOCUMENT_GUIDANCE.length).toBeLessThan(1600);
  });
});

/**
 * Ce que le modèle ne doit PAS pouvoir répondre à « est-ce que mes informations restent
 * chez moi ? ». Sans ancrage, il inventait trois garanties fausses (rien de partagé, rien
 * de conservé, sessions indépendantes) — la classe d'erreur la plus grave pour ce produit,
 * puisqu'elle trompe sur l'endroit où vont les données.
 */
describe("PRODUCT_GROUNDING — le flux réel, y compris ce qui PART", () => {
  it("dit que le reste du message va bien à un TIERS", () => {
    expect(PRODUCT_GROUNDING).toMatch(/TIERS/);
    expect(PRODUCT_GROUNDING).toMatch(/voyage bel et bien/);
  });

  it("interdit nommément les trois formules mesurées", () => {
    expect(PRODUCT_GROUNDING).toMatch(/Ne dis jamais que rien n'est envoyé, ni que rien n'est partagé/);
    expect(PRODUCT_GROUNDING).toMatch(/jamais que chaque session est indépendante ni que rien n'est conservé/);
  });

  it("ne sur-promet pas : il dit aussi ce que le modèle IGNORE", () => {
    expect(PRODUCT_GROUNDING).toMatch(/ne connais NI les réglages/);
  });

  it("part avec CHAQUE message, en tête du système", () => {
    const sys = buildSystemContent((t: string) => ({ text: t }) as never, undefined, false);
    expect(sys).toContain(PRODUCT_GROUNDING);
    expect(sys.indexOf(PRODUCT_GROUNDING)).toBeLessThan(sys.indexOf(LANGUAGE_GUIDANCE));
  });
});

// Le repli « écran Confidentialité » ne doit pas devenir le repli de TOUT ce que le modèle
// ignore : mesuré, à « ça me coûte combien ? » il y renvoyait — un écran qui ne dit rien
// des prix.
it("borne son repli à la CONFIDENTIALITÉ, pas à tout ce qu'il ignore", () => {
  expect(PRODUCT_GROUNDING).toMatch(/question SUR LA CONFIDENTIALITÉ dépasse ces faits/);
  expect(PRODUCT_GROUNDING).toMatch(/Sur les prix, les crédits, l'abonnement/);
  expect(PRODUCT_GROUNDING).toMatch(/ne renvoie PAS vers/);
});
