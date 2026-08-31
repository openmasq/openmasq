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
    // The rule used to only talk about « la réponse » (the answer): the model answered in French and
    // reasoned in English — under « Réflexion », in the middle of a French conversation.
    expect(LANGUAGE_GUIDANCE).toMatch(/LANGUE du message de l'utilisateur/);
    expect(LANGUAGE_GUIDANCE).toMatch(/thinking|chaîne de pensée/);
    expect(LANGUAGE_GUIDANCE).toMatch(/pas en anglais/);
  });

  it("DIT pourquoi — un modèle ne peut pas deviner que sa réflexion est montrée", () => {
    expect(LANGUAGE_GUIDANCE).toMatch(/AFFICHÉ/);
  });

  it("le rappel dit la MÊME chose que la règle — sinon c'est une seconde source", () => {
    // `LANGUAGE_REMINDER` is a deliberate echo (recency), not a variant: both
    // must govern the answer AND the reflection, and name English as the pitfall
    // to avoid. The day one changes without the other, this test fails.
    for (const s of [LANGUAGE_GUIDANCE, LANGUAGE_REMINDER]) {
      expect(s).toMatch(/langue du message de l'utilisateur/i);
      expect(s).toMatch(/thinking|chaîne de pensée|réflexion/i);
      expect(s).toMatch(/anglais/i);
    }
  });

  it("sur un tour AGENTIQUE la règle finit le message système, elle n'y est pas juste présente", () => {
    // The real symptom wasn't a missing rule, it was a BURIED rule:
    // `withToolGuidance` appends thousands of characters of tooling behind it, and
    // the model reads a page about the browser last. This test measures the TAIL.
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

    // The base rule is always there (it also governs the non-agentic path)…
    expect(sys).toContain(LANGUAGE_GUIDANCE);
    // …but what the model reads LAST, before the user's turn, is the reminder.
    expect(sys.trimEnd().endsWith(LANGUAGE_REMINDER)).toBe(true);
    // And the tooling instruction, for its part, must no longer be the last word.
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
    // The card's editor renders NEITHER level-4+ headings NOR nested
    // lists (they fall back to literal text): forbidding them to the model is a
    // rendering fact, and the test fails if the instruction loses the prohibition.
    expect(DOCUMENT_GUIDANCE).toMatch(/niveau 4\+/);
    expect(DOCUMENT_GUIDANCE).toMatch(/liste imbriquée/);
    expect(DOCUMENT_GUIDANCE).toMatch(/tableau Markdown/);
  });

  it("demande la typographie française — dont l'espace que la micro-typo saura souder", () => {
    // `microTypography.ts` only REPLACES an existing space with a
    // non-breaking one: if the model doesn't write the space before « : ; ! ? », there's nothing
    // to fuse. The instruction and the module form a pair.
    expect(DOCUMENT_GUIDANCE).toMatch(/espace avant/i);
    expect(DOCUMENT_GUIDANCE).toContain("12 000");
  });

  it("reste courte — elle voyage dans CHAQUE message système", () => {
    expect(DOCUMENT_GUIDANCE.length).toBeLessThan(1600);
  });
});

/**
 * What the model must NOT be able to answer to « est-ce que mes informations restent
 * chez moi ? ». Without anchoring, it invented three false guarantees (nothing shared, nothing
 * retained, independent sessions) — the most serious error class for this product,
 * since it misleads about where the data goes.
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

// The « écran Confidentialité » fallback must not become the fallback for EVERYTHING the model
// doesn't know: measured, asked « ça me coûte combien ? » it pointed there — a screen that says nothing
// about prices.
it("borne son repli à la CONFIDENTIALITÉ, pas à tout ce qu'il ignore", () => {
  expect(PRODUCT_GROUNDING).toMatch(/question SUR LA CONFIDENTIALITÉ dépasse ces faits/);
  expect(PRODUCT_GROUNDING).toMatch(/Sur les prix, les crédits, l'abonnement/);
  expect(PRODUCT_GROUNDING).toMatch(/ne renvoie PAS vers/);
});
