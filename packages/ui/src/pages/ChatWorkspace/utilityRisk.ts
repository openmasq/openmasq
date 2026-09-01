import type { Cat } from "./composerDetection";

// THE UTILITY WARNING — detecting that the RESPONSE is going to depend on a redacted value.
//
// A fake preserves the species (gender, country, checksum…) but not everything: an age computed from
// a fake date of birth is wrong, "what does this company do?" queries an
// entity the model doesn't know, a distance between two fake places means nothing
// — and a DERIVATION is not a vault key: nothing restores it. The risk is
// invisible by construction (the returned text is correct, only the reasoning is
// wrong), so it has to be said BEFORE sending. Measured in
// `packages/redact/bench/RAPPORT-risques-utilite-2026-07.md`.
//
// It's the generalization of the `WebNavRedactOffer` pattern (the reveal gate before a
// web search), with the same principles:
//  - DETERMINISTIC — a question pattern + a detected category, never a model;
//  - BOTH conditions, or nothing: a pattern with no redacted data in the category is
//    just an ordinary question, a data point with no pattern is just a protected value. A
//    warning that talks too much teaches you to click without reading (the lesson written
//    into the write gate);
//  - it BLOCKS nothing: the badge informs and offers the « garder en clair » action that
//    already exists (`toggleKeep`) — default redaction doesn't move.

export type UtilityRiskKind = "age" | "world" | "geo";

export interface UtilityRisk {
  kind: UtilityRiskKind;
  /** The engine categories the answer depends on (to target the values to reveal). */
  cats: readonly string[];
  /** What the badge says — the LIMIT, never a promise. */
  message: string;
}

/** Question pattern per risk. Multilingual FR/EN, WHOLE words, case-insensitive. */
const PATTERNS: Record<UtilityRiskKind, RegExp> = {
  // A calculation on a date: age, seniority, elapsed/remaining time, age-based eligibility.
  age: /\b(quel\s+[âa]ge|[âa]g[ée]e?s?\s+de\s+(?:moins|plus)|depuis\s+combien|dans\s+combien\s+de\s+(?:temps|jours|mois|ans)|combien\s+d['’]ann[ée]es|anciennet[ée]|majeur|mineur|retraite|how\s+old|years?\s+old|age\s+of|eligib\w*)\b/iu,
  // World knowledge about an entity: what it IS, does, is worth, who runs it.
  world:
    /\b(que\s+fait|qui\s+est\s+derri[èe]re|c['’]est\s+quoi\s+comme\s+(?:boite|bo[îi]te|entreprise|soci[ée]t[ée])|quel\s+secteur|convention\s+collective|concurrents?\s+de|what\s+does\s+\S+\s+do|who\s+owns|competitors?\s+of|industry\s+of)\b/iu,
  // Derived geography: distance, trip, proximity, same city/region, local weather.
  geo: /\b(distance|combien\s+de\s+(?:km|kilom[èe]tres)|temps\s+de\s+(?:trajet|route)|proche\s+de|pr[èe]s\s+de\s+chez|m[êe]me\s+(?:ville|r[ée]gion|d[ée]partement|quartier)|itin[ée]raire|how\s+far|close\s+to|same\s+(?:city|region|area)|route\s+to|commute)\b/iu,
};

/** The engine categories each risk carries (FINE-grained keys, `redactionCategory`). */
const RISK_CATS: Record<UtilityRiskKind, readonly string[]> = {
  age: ["dob", "date"],
  world: ["company"],
  geo: ["location", "address"],
};

const MESSAGES: Record<UtilityRiskKind, string> = {
  age: "La réponse dépend d'une date redacted — un âge ou un délai calculé peut être décalé.",
  world: "Le modèle ne connaît pas l'entreprise sous son nom d'emprunt — il ne peut rien savoir d'elle.",
  geo: "Distances et proximités sont calculées sur des lieux d'emprunt — le résultat ne veut rien dire.",
};

/**
 * The draft's utility risk, or null. `detected` is the output of the composer's TWO
 * detection layers (`Cat.cat` = the engine's fine category) — so exactly what
 * will be redacted on send, no more, no less.
 *
 * Only one risk at a time, the first by severity (age > world > geo): two badges
 * would already be noise.
 */
export function utilityRisk(text: string, detected: readonly Cat[]): UtilityRisk | null {
  if (!text.trim() || detected.length === 0) return null;
  const present = new Set(detected.map((d) => d.cat.toLowerCase()));
  for (const kind of ["age", "world", "geo"] as const) {
    if (!PATTERNS[kind].test(text)) continue;
    const cats = RISK_CATS[kind].filter((c) => present.has(c));
    if (cats.length === 0) continue; // pattern with no redacted data → ordinary question
    return { kind, cats, message: MESSAGES[kind] };
  }
  return null;
}

/** The draft's values that « Garder en clair » must release for this risk. */
export function riskValues(risk: UtilityRisk, detected: readonly Cat[]): string[] {
  const wanted = new Set(risk.cats);
  return [...new Set(detected.filter((d) => wanted.has(d.cat.toLowerCase())).map((d) => d.value))];
}

/** The strict minimum of an attachment needed to derive risk categories from it. */
export interface RiskAttachment {
  replacements?: readonly { real: string; kind?: string }[];
  reveal?: readonly string[];
}

/**
 * The redacted categories carried by ATTACHMENTS — the same fine vocabulary as
 * the composer (`PdfReplacement.kind` = `Cat.cat`). A date of birth lives far more
 * often in a report or a file than in the typed draft: without this source,
 * the warning was blind to the most frequent case (measured 15/08: substitute born in
 * 1948 for a 57-year-old patient — answer calibrated for "elderly person", without a word).
 * A value already revealed (`reveal`) goes out in clear: no longer a risk, so excluded here.
 */
export function attachmentCats(attachments: readonly RiskAttachment[]): Cat[] {
  return attachments.flatMap((a) => {
    const revealed = new Set(a.reveal ?? []);
    return (a.replacements ?? [])
      .filter((r) => r.kind && !revealed.has(r.real))
      .map((r) => ({ value: r.real, cat: r.kind as string }));
  });
}

/** Attachment addressable by the « garder en clair » action (the `onRevealChange` channel). */
export interface RevealableAttachment extends RiskAttachment {
  cid: string;
}

/**
 * What « Garder en clair » must do with a risk's values: the DRAFT's values
 * go through the existing keep; an ATTACHMENT's values go through the file's
 * `reveal` list — the same action as « Démasquer » in the aperçu. Rendered as
 * a plan (cid → new list) to stay pure and testable.
 */
export function revealPlan(
  values: readonly string[],
  attachments: readonly RevealableAttachment[],
): { cid: string; reveal: string[] }[] {
  const plan: { cid: string; reveal: string[] }[] = [];
  for (const a of attachments) {
    const mine = new Set((a.replacements ?? []).map((r) => r.real));
    const add = values.filter((v) => mine.has(v) && !(a.reveal ?? []).includes(v));
    if (add.length) plan.push({ cid: a.cid, reveal: [...(a.reveal ?? []), ...add] });
  }
  return plan;
}
