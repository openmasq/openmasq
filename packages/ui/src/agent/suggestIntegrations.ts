/**
 * Pure logic for the "suggested integrations" feature: when the model can't fulfil a
 * request because a needed integration isn't connected (e.g. "envoie un email" with no
 * Gmail), it calls the `suggest_integrations` meta-tool and the chat renders clickable
 * connector cards. This module owns the candidate computation, the model-facing tool +
 * guidance, and the validation of what the model returned. No React / no side effects,
 * so it's trivially unit-tested. Kept OUT of the (already >300 LOC) `mcpAgent.ts`.
 */
import type { ToolDef } from "@openmasq/llm";
import { isStrongMatch } from "./integrationRelevance";
import {
  BROWSER_CONNECTOR_ID,
  findConnector,
  MCP_CONNECTORS,
  connectorIdFromInstance,
  groupByMcpCategory,
  type McpConnector,
} from "@openmasq/catalog/mcp";

/** Connectors we never propose: the broker `demo` placeholder isn't a real service. */
const SUGGEST_EXCLUDE = new Set(["demo"]);

/** What the caller knows about the controllable browser this send — the ONLY
 *  connector whose availability isn't derivable from the catalog + the connected set
 *  (it's a host capability, absent on the web preview / mobile). */
export interface BrowserState {
  /** Browser tools are in the connected set → it already does web search. */
  connected?: boolean;
  /** The host can turn it on (`host.mcp.enableBrowser` exists) — so a card that
   *  deep-links to Réglages → Intégrations actually leads somewhere. */
  enableable?: boolean;
}

/** At most this many cards per turn — a longer list reads as noise, not a suggestion.
 *  Two, measured: four tiles under a reply were a catalogue, not an answer. */
export const MAX_SUGGESTIONS = 2;

/** The connector ids currently connected, from the live tool list's `serverId`s
 *  (a multi-account instance id like `gmail--a1b2` maps back to `gmail`). */
export function connectedConnectorIds(serverIds: Iterable<string>): Set<string> {
  const s = new Set<string>();
  for (const id of serverIds) s.add(connectorIdFromInstance(id));
  return s;
}

/**
 * The connected connector ids as seen from the LIVE TOOL LIST — read on the tool
 * NAME's prefix first, `serverId` as fallback. ⚠️ Never `serverId` alone: the loop's
 * `RedactingMcpClient` has ONE connection ("ipc") and rewrites every tool's `serverId`
 * with it (same trap as the org-block filter, documented in `mcpAgent.ts`). Keyed on
 * `serverId`, the connected set was `{ipc}` — every connector, freshly-connected ones
 * included, stayed listed « PAS encore connectées » in the guidance + the meta-tool
 * enum, and a compliant model kept re-suggesting a connector the user had JUST
 * connected until the conversation was reloaded. Main namespaces names
 * (`stripe__list_payments`), so the prefix is the reliable source; `serverId` still
 * counts second for hosts that give one connection per connector.
 */
export function connectorIdsFromTools(
  tools: Iterable<{ name: string; serverId: string }>,
): Set<string> {
  const s = new Set<string>();
  for (const t of tools) {
    const i = t.name.indexOf("__");
    if (i > 0) s.add(connectorIdFromInstance(t.name.slice(0, i)));
    if (t.serverId) s.add(connectorIdFromInstance(t.serverId));
  }
  return s;
}

/** The candidate set for a suggestion = every catalog connector NOT already connected
 *  (excluding the non-real placeholders). Order follows the catalog.
 *
 *  The **browser** is the one connector the catalog alone can't decide on, so it's
 *  driven by `browser`:
 *   - it is a candidate ONLY when the host can actually enable it AND it isn't already
 *     connected. Without this it was the ONE integration the model could never propose
 *     as a card (it isn't reachable via `enableBrowser` on the web preview / mobile) —
 *     the user was told in prose to go find it in Réglages while every other
 *     integration got a one-click card;
 *   - once it's available (connected OR merely enableable), `category:"search"`
 *     connectors (Tavily/Exa/Firecrawl) are dropped — the browser already does web
 *     search for free, so pushing a paid one is redundant/wrong (a weak model asked to
 *     connect Tavily for "actualités 2026" while the browser was right there).
 *     `BROWSER_RECENCY_GUIDANCE` then steers it to browse. */
export function notConnectedConnectors(
  connected: Set<string>,
  browser: BrowserState = {},
): McpConnector[] {
  const browserAvail = !!browser.connected || !!browser.enableable;
  const browserSuggestable = !!browser.enableable && !browser.connected;
  return MCP_CONNECTORS.filter((c) => {
    if (c.id === BROWSER_CONNECTOR_ID) return browserSuggestable;
    return (
      !SUGGEST_EXCLUDE.has(c.id) &&
      c.transport !== "broker" &&
      !connected.has(c.id) &&
      !(browserAvail && c.category === "search")
    );
  });
}

/** The catalogue entries the user ALREADY has — the other half of
 *  `notConnectedConnectors`, and what tells `connectorsForRequest` that a NEED is
 *  already covered (Gmail connected ⇒ « mes e-mails » proposes no second mailbox). */
export function connectedConnectors(connected: Set<string>): McpConnector[] {
  return MCP_CONNECTORS.filter((c) => connected.has(c.id));
}

/** Keep only KNOWN, not-connected ids (mapping instance ids back to connectors),
 *  de-duped and capped — so a hallucinated / already-connected id never renders. */
export function validateSuggestions(ids: unknown, candidates: McpConnector[]): string[] {
  const allowed = new Set(candidates.map((c) => c.id));
  const list = Array.isArray(ids) ? ids : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const id = connectorIdFromInstance(String(raw ?? "").trim());
    if (!id || seen.has(id) || !allowed.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/** System-prompt block listing the connectable (not-connected) integrations grouped by
 *  category, so the model can name the right id when it lacks access. Empty when there's
 *  nothing to suggest (everything connected). Wire-safe (no PII). */
export function suggestGuidance(candidates: McpConnector[]): string {
  if (candidates.length === 0) return "";
  const lines: string[] = [];
  for (const g of groupByMcpCategory(candidates)) {
    lines.push(`### ${g.label}`);
    for (const c of g.items) lines.push(`- ${c.id} — ${c.name} : ${c.desc}`);
  }
  return (
    "\n\nCERTAINES intégrations ne sont PAS encore connectées. Si — et SEULEMENT si — tu ne peux pas " +
    "satisfaire la demande de l'utilisateur parce qu'il te manque l'ACCÈS à un service externe (envoyer " +
    "un email, consulter un agenda, un CRM, un dépôt de code, un stockage de fichiers, un outil de " +
    "paiement…), n'affirme pas seulement que tu ne peux pas : appelle l'outil `suggest_integrations` avec " +
    "le ou les `integration_ids` de la liste ci-dessous qui débloqueraient la demande, puis explique " +
    "brièvement à l'utilisateur ce que la connexion permettra. N'appelle PAS cet outil si la demande ne " +
    "requiert aucun service externe, ni pour une intégration déjà connectée.\n\n" +
    lines.join("\n")
  );
}

/** The `suggest_integrations` meta-tool, its `integration_ids` enum restricted to the
 *  not-connected candidate ids so the model can only pick a valid, connectable one. */
export function suggestIntegrationsDef(candidates: McpConnector[]): ToolDef {
  return {
    name: "suggest_integrations",
    description:
      "À appeler UNIQUEMENT lorsque tu ne peux PAS répondre à la demande parce qu'une intégration " +
      "nécessaire n'est pas connectée. Propose la ou les intégration(s) qui débloqueraient la demande : " +
      "elles seront affichées à l'utilisateur sous forme de cartes cliquables pour se connecter en un " +
      "geste. N'appelle jamais cet outil si aucun service externe n'est requis, ni pour un service déjà " +
      "connecté.",
    parameters: {
      type: "object",
      properties: {
        integration_ids: {
          type: "array",
          items: { type: "string", enum: candidates.map((c) => c.id) },
          description: `Les ids des intégrations à proposer (1 à ${MAX_SUGGESTIONS}), pris dans la liste fournie.`,
        },
        reason: {
          type: "string",
          description: "Courte explication (optionnelle) de ce que la connexion permettra.",
        },
      },
      required: ["integration_ids"],
      additionalProperties: false,
    },
  };
}

/**
 * The `suggest_integrations` call, resolved: the VALID ids to pin on the message and the
 * tool message that goes back to the model. Pure — the loop keeps only the side effects.
 *
 * ⚠️ The model's pick is CORROBORATED against the request (`isStrongMatch`) when the
 * request text is given: a model that reads « lettre de relance » and proposes Gmail is
 * guessing a need the user never expressed, and a card off the mark teaches people to
 * ignore cards. Same bar as our own catch-up — the service named, or an imperative only
 * that tool honours — so the two paths cannot disagree about what counts.
 *
 * The instruction not to repeat the names is not style: the cards already carry them, and
 * a model that lists them again turns one proposal into two, one of them unclickable.
 */
export function resolveSuggestCall(
  rawIds: unknown,
  candidates: McpConnector[],
  requestText?: string,
  connected: readonly McpConnector[] = [],
): { ids: string[]; message: string } {
  const valid = validateSuggestions(rawIds, candidates);
  const ids =
    requestText === undefined
      ? valid
      : valid.filter((id) => {
          const c = findConnector(id);
          return !!c && isStrongMatch(requestText, c, connected);
        });
  const names = ids.map((id) => findConnector(id)?.name ?? id);
  return {
    ids,
    message: ids.length
      ? `Cartes de connexion proposées à l'utilisateur : ${names.join(", ")}. Explique brièvement, en une phrase, ce que la connexion débloquera — ne répète pas la liste des noms.`
      : "Aucune intégration valide à proposer ici. Réponds directement à l'utilisateur.",
  };
}
