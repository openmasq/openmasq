import { connectorIdFromInstance, findConnector, type McpConnector } from "@openmasq/catalog/mcp";
import { MAX_SUGGESTIONS } from "./suggestIntegrations";

/**
 * **Which not-connected integration would unblock THIS request** — computed by us, not
 * asked of the model.
 *
 * `suggest_integrations` already renders connect cards, but only if the model chooses to
 * call it, and a weak model does not: asked to review a Gmail inbox with no Gmail
 * connected, it reached for the web page reader, failed, and told the user in prose to
 * connect Gmail — three turns to arrive at a card we could have shown before the first
 * one (journal du 02/08/2026). Everything here is deterministic, so the proposal no
 * longer depends on the model being good.
 *
 * Local by construction: it reads the user's own text in the renderer and emits catalog
 * IDS. Nothing here reaches the wire.
 */

/** The FR words a user actually types for a service whose brand name they may never
 *  write ("ma boîte mail", "mon agenda") — those that DESIGNATE on their own; a generic
 *  noun that only designates under a possessive lives in `OWNED_NOUNS` below.
 *  Kept TIGHT on purpose — a loose alias proposes
 *  the wrong connector, which is worse than proposing none: « documents » would drag in
 *  Drive on any request mentioning a document. Keyed by connector id, like
 *  `toolActionLabel`'s `CONNECTOR_LABEL`. A connector absent here still matches on its
 *  own NAME, which is the common case (« sur Notion », « dans Stripe »). */
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

/** Les noms GÉNÉRIQUES d'un service, qui ne le désignent que sous POSSESSIF. « mail » nu
 *  était un alias : « je vais envoyer des emails à nos cent premiers utilisateurs, est-ce
 *  que je dois warmup le compte ? » proposait donc de connecter Gmail sous une réponse qui
 *  ne parlait pas de la boîte de l'utilisateur (remonté le 11/08). PARLER d'e-mails n'est
 *  pas demander d'agir sur les SIENS — et un verbe d'action ne départage rien, « envoyer
 *  des emails » en est un. Seul le possessif dit « ce service est le mien ».
 *  ⚠️ Le prix assumé : « envoie un mail à Paul » ne déclenche plus de carte par ici. C'est
 *  le rattrapage d'un modèle FAIBLE (docstring en tête), pas le chemin normal — le modèle
 *  garde `suggest_integrations`, et une carte de travers apprend à ignorer les cartes. */
const OWNED_NOUNS: Record<string, string[]> = {
  gmail: ["mail", "mails", "e-mail", "e-mails", "email", "emails", "courriel", "courriels", "messagerie"],
  "microsoft-outlook": ["mail", "mails", "e-mail", "e-mails", "messagerie"],
};
const POSSESSIVES = ["mon", "ma", "mes", "notre", "nos"];
/** Le produit possessif × nom, calculé une fois — `hasPhrase` normalise chaque terme. */
const OWNED_PHRASES: Record<string, string[]> = Object.fromEntries(
  Object.entries(OWNED_NOUNS).map(([id, nouns]) => [
    id,
    POSSESSIVES.flatMap((p) => nouns.map((n) => `${p} ${n}`)),
  ]),
);

/** Tous les termes génériques d'un connecteur : ceux qui se suffisent + ceux sous possessif. */
function genericTermsOf(id: string): string[] {
  return [...(ALIASES[id] ?? []), ...(OWNED_PHRASES[id] ?? [])];
}

/** Lower-cased, accent-stripped, punctuation → spaces. Matching « Boîte mail » against
 *  « boite mail » is the whole point: users type accents, and inconsistently. */
function normalise(text: string): string {
  return ` ${text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Does `haystack` (already normalised, space-padded) contain `needle` as WHOLE words?
 *  Substring matching would fire « mail » inside « mailing » and « notion » inside
 *  « notionnel » — a card proposed on a coincidence teaches the user to ignore cards. */
function hasPhrase(haystack: string, needle: string): boolean {
  const n = normalise(needle).trim();
  return n.length > 2 && haystack.includes(` ${n} `);
}

/** A connector's BRAND terms (its name, and the distinctive half of a namespaced id) —
 *  what a user types when they mean THAT service and no other. */
function brandTerms(c: McpConnector): string[] {
  return [c.name, ...(c.id.includes("-") ? [c.id.split("-").slice(1).join(" ")] : [])];
}

/**
 * The candidates whose service the request NAMES — by brand name, by connector id, or by
 * one of the French aliases above. Ordered as the catalog orders them and capped like any
 * other suggestion set, because four cards is already the point at which a proposal reads
 * as noise.
 *
 * ⚠️ **A NEED already served by a connected connector proposes nothing** (`connected`).
 * The aliases are per-SERVICE but the need is not: « mes e-mails » claims both `gmail`
 * and `microsoft-outlook`, so a user with Gmail connected, asking to review their inbox,
 * was offered Outlook — a card for a second mailbox they never asked for, under an
 * answer that had just read the first (journal du 03/08/2026). Suppression is scoped to
 * the GENERIC match: naming the brand (« sur Outlook ») is an explicit ask and still
 * proposes, whatever else is connected.
 */
export function connectorsForRequest(
  text: string,
  candidates: McpConnector[],
  connected: readonly McpConnector[] = [],
): McpConnector[] {
  if (!text.trim()) return [];
  const hay = normalise(text);
  // The generic terms the CONNECTED connectors already answer for.
  const served = new Set<string>();
  for (const c of connected) for (const a of genericTermsOf(c.id)) served.add(normalise(a).trim());
  const out: McpConnector[] = [];
  for (const c of candidates) {
    if (brandTerms(c).some((t) => hasPhrase(hay, t))) {
      out.push(c); // named outright — an explicit ask beats any coverage rule
    } else {
      const hits = genericTermsOf(c.id).filter((t) => hasPhrase(hay, t));
      if (hits.length && !hits.every((t) => served.has(normalise(t).trim()))) out.push(c);
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * What a WORKFLOW's declared connectors are missing, and whether that leaves it unable to
 * do anything at all.
 *
 * This one needs no matching — the routine STATES what it needs (`Workflow.servers`), so
 * the answer exists before the first model call. It is the difference between telling the
 * user « connectez Gmail » straight away and spending a turn discovering it. `unusable` =
 * every declared connector is missing: nothing the model does can succeed, so the loop
 * says so rather than letting it improvise.
 */
export function scopePreflight(
  declared: readonly string[] | undefined,
  connected: ReadonlySet<string>,
): { missing: string[]; unusable: boolean } {
  const ids: string[] = [];
  for (const raw of declared ?? []) {
    const id = connectorIdFromInstance(String(raw ?? "").trim());
    if (id && !ids.includes(id)) ids.push(id);
  }
  const missing = ids.filter((id) => !connected.has(id));
  return { missing, unusable: missing.length > 0 && missing.length === ids.length };
}

/**
 * What to say when a workflow's connectors are ALL missing — a real failure, told plainly
 * (« Surface real failures »): what is needed, why nothing ran, and that the cards under
 * the message are the way out. Never an apology, never an attempt to answer anyway.
 *
 * Wire-safe: connector NAMES only, no request content.
 */
export function missingConnectorMessage(ids: readonly string[]): string {
  const names = ids.map((id) => findConnector(id)?.name ?? id);
  const list = names.length === 1 ? `« ${names[0]} »` : names.map((n) => `« ${n} »`).join(", ");
  const need = names.length === 1 ? "Cette intégration n'est pas connectée" : "Ces intégrations ne sont pas connectées";
  return (
    `${need} : ${list}. Je n'ai donc lancé aucune action — sans elle${names.length > 1 ? "s" : ""}, ` +
    `je n'ai aucun accès à ces données.\n\nConnectez-la${names.length > 1 ? "s" : ""} avec le bouton ci-dessous, ` +
    `puis relancez : je reprendrai la demande telle quelle.`
  );
}
