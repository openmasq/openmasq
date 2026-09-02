import type { McpConnector } from "@openmasq/catalog/mcp";

/**
 * **Does THIS request call for THAT service?** — the one lexical judgement behind every
 * integration card, whichever path raised it (our deterministic catch-up in
 * `integrationMatch.ts`, or the model's own `suggest_integrations` call, corroborated in
 * `suggestIntegrations.ts`).
 *
 * The bar is a STRONG match, never a co-occurrence: a card proposed on a coincidence
 * teaches people to ignore cards (measured 2026-08: « Square » and « Gmail » offered
 * under a follow-up letter that merely carried an address and the word « courrier »).
 * Three things clear it, nothing else:
 *   - the service is NAMED (brand or id) — and a brand that is also an ordinary word
 *     (« square », « notion », « linear ») only counts in a SERVICE position (« sur
 *     Notion », « mes pages Notion »), never bare;
 *   - one of the tight French aliases people type instead of a brand (« ma boîte
 *     mail », « mon agenda ») — those that DESIGNATE, a generic noun only under a
 *     possessive (talking about e-mails is not asking to act on one's own);
 *   - an IMPERATIVE addressed to the assistant that only that tool can honour
 *     (« envoie-la par mail », « planifie une réunion ») — the infinitive of a plan
 *     (« je vais envoyer des emails ») is not an ask.
 *
 * Local by construction: reads the user's own text in the renderer, emits catalog IDS.
 */

/** Lower-cased, accent-stripped, punctuation → spaces, space-padded so whole-word
 *  lookups are a plain `includes`. « Boîte mail » vs « boite mail » is the whole point. */
export function normalise(text: string): string {
  return ` ${text
    // An address or a URL is not a mention: « jean@gmail.com » names nobody's mailbox
    // tool, and « drive.google.com/… » is a link, not a request for Drive.
    .replace(/\S+@\S+/g, " ")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fr|io|net|org|eu|co|app|dev)\b/gi, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Whole-word containment on a normalised haystack — substring matching would fire
 *  « mail » inside « mailing » and « notion » inside « notionnel ». */
function hasPhrase(hay: string, needle: string): boolean {
  const n = normalise(needle).trim();
  return n.length > 2 && hay.includes(` ${n} `);
}

/** The FR words that DESIGNATE a service on their own. Kept TIGHT: « documents » would
 *  drag Drive into any request mentioning a document. */
const ALIASES: Record<string, string[]> = {
  gmail: ["boite mail", "boites mail"],
  "microsoft-outlook": ["boite mail"],
  "google-calendar": ["agenda", "calendrier", "mes rendez-vous", "mes reunions"],
  "google-drive": ["mon drive", "mes fichiers"],
  "google-sheets": ["tableur", "feuille de calcul", "feuilles de calcul"],
  "google-tasks": ["mes taches", "ma todo"],
  github: ["mes depots", "mon depot", "pull request", "pull requests"],
  linear: ["mes tickets"],
  stripe: ["mes paiements", "mon chiffre d affaires", "ma caisse"],
};

/** Generic names that designate the service only under a POSSESSIVE (« mes mails »). */
const OWNED_NOUNS: Record<string, string[]> = {
  gmail: ["mail", "mails", "e-mail", "e-mails", "email", "emails", "courriel", "courriels", "messagerie"],
  "microsoft-outlook": ["mail", "mails", "e-mail", "e-mails", "messagerie"],
};
const POSSESSIVES = ["mon", "ma", "mes", "notre", "nos"];
const OWNED_PHRASES: Record<string, string[]> = Object.fromEntries(
  Object.entries(OWNED_NOUNS).map(([id, nouns]) => [
    id,
    POSSESSIVES.flatMap((p) => nouns.map((n) => `${p} ${n}`)),
  ]),
);

/** All of a connector's generic terms — aliases + owned phrases. Exported so the
 *  coverage rule (« a need already served proposes nothing ») can read them. */
function genericTermsOf(id: string): string[] {
  return [...(ALIASES[id] ?? []), ...(OWNED_PHRASES[id] ?? [])];
}

/** Brand words that are ALSO ordinary words in French or English — bare, they name a
 *  place, a shape or an idea, not a service. Includes the distinctive half of a
 *  namespaced id (`google-docs` → « docs », `microsoft-teams` → « teams »). */
const AMBIGUOUS_BRANDS = new Set([
  "square", "linear", "notion", "close", "monday", "neon", "synapse", "amplitude",
  "analytics", "teams", "tasks", "docs", "sheets", "calendar", "drive", "postgres", "demo",
]);

/** The word BEFORE an ambiguous brand that puts it in a service position: a
 *  preposition, a possessive, or the noun of a thing the service holds. */
const SERVICE_CONTEXT = [
  "sur", "dans", "via", "avec", "depuis", "de", "du", "mon", "ma", "mes", "notre", "nos",
  "compte", "espace", "page", "pages", "base", "bases", "board", "boards", "projet",
  "projets", "tickets", "issues", "workspace", "outil", "app", "in", "on", "my", "our",
  "from", "into", "with", "to",
];

/** A connector's brand terms: its name, and the distinctive half of a namespaced id. */
function brandTerms(c: McpConnector): string[] {
  return [c.name, ...(c.id.includes("-") ? [c.id.split("-").slice(1).join(" ")] : [])];
}

function brandNamed(hay: string, c: McpConnector): boolean {
  for (const term of brandTerms(c)) {
    const n = normalise(term).trim();
    if (n.length <= 2 || !hay.includes(` ${n} `)) continue;
    if (!AMBIGUOUS_BRANDS.has(n)) return true;
    if (SERVICE_CONTEXT.some((w) => hay.includes(` ${w} ${n} `))) return true;
  }
  return false;
}

/** The needs a tool answers for, and the imperative that asks for each. Only the tools
 *  whose ask has ONE unmistakable verb are listed — everything else needs its name. */
type Need = "mail" | "calendar";
const NEED_ACTIONS: Record<Need, RegExp> = {
  mail: /\b(envoie|envoyez|transmets|transmettez|expedie|expediez|reponds|repondez|renvoie|renvoyez|send|reply|forward)\b.{0,60}?\b(mail|mails|e mail|e mails|email|emails|courriel|courriels)\b/,
  calendar:
    /\b(planifie|planifiez|cale|calez|reserve|reservez|bloque|bloquez|decale|decalez|deplace|deplacez|schedule|reschedule|book)\b.{0,60}?\b(rendez vous|rdv|reunion|reunions|creneau|creneaux|invitation|agenda|calendrier|meeting|meetings)\b/,
};
const NEEDS_OF: Record<string, Need[]> = {
  gmail: ["mail"],
  "microsoft-outlook": ["mail", "calendar"],
  "google-calendar": ["calendar"],
};

/** What the CONNECTED connectors already answer for — generic terms and needs — so a
 *  covered ask proposes no second provider (« mes e-mails » with Gmail connected must
 *  not offer Outlook). Naming a brand outright still proposes, whatever is connected. */
export interface Served {
  terms: Set<string>;
  needs: Set<Need>;
}
export function servedBy(connected: readonly McpConnector[]): Served {
  const terms = new Set<string>();
  const needs = new Set<Need>();
  for (const c of connected) {
    for (const a of genericTermsOf(c.id)) terms.add(normalise(a).trim());
    for (const n of NEEDS_OF[c.id] ?? []) needs.add(n);
  }
  return { terms, needs };
}
export const NOTHING_SERVED: Served = { terms: new Set(), needs: new Set() };

export type MatchStrength = "brand" | "alias" | "action";

/**
 * How strongly `hay` (already normalised) asks for `c` — or `null` for a coincidence.
 * A brand beats coverage (an explicit ask); an alias or an imperative counts only while
 * the need it expresses is not already served.
 */
export function matchStrength(hay: string, c: McpConnector, served: Served): MatchStrength | null {
  if (brandNamed(hay, c)) return "brand";
  const hits = genericTermsOf(c.id).filter((t) => hasPhrase(hay, t));
  if (hits.length && !hits.every((t) => served.terms.has(normalise(t).trim()))) return "alias";
  for (const need of NEEDS_OF[c.id] ?? []) {
    if (!served.needs.has(need) && NEED_ACTIONS[need].test(hay)) return "action";
  }
  return null;
}

/** The plain-text entry point for a single connector (the model-path corroboration). */
export function isStrongMatch(text: string, c: McpConnector, connected: readonly McpConnector[] = []): boolean {
  if (!text.trim()) return false;
  return matchStrength(normalise(text), c, servedBy(connected)) !== null;
}
