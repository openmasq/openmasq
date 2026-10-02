import { findConnector, MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import { getMessages, type Locale } from "@openmasq/i18n";
import { connectorOfServer } from "../state/conversation/mcpIds";

/**
 * What the redaction must leave in clear because it NAMES or ADDRESSES an integration —
 * never the user's data. Two lists, both ALLOW-lists derived from the catalogue.
 */

const LOCALES: Locale[] = ["fr", "en"];

/** "OneDrive" → "One Drive", "SharePoint" → "Share Point": how people TYPE a product
 *  whose brand glues two words. Null when the name has no inner capital. */
function spacedVariant(name: string): string | null {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced !== name ? spaced : null;
}

let cached: string[] | null = null;

/**
 * Every catalogue integration's PRODUCT name — « OneDrive », « Google Drive », « Slack »,
 * « Notion », « Microsoft Teams » — in both languages, plus the spaced spelling of a
 * glued brand (« One Drive »). Kept in clear at EVERY level, strict included: the model
 * must recognise the tool it is asked to use, and a product name is not personal data.
 *
 * Whole names only: « Microsoft » or « Google » alone is a COMPANY and stays maskable —
 * the engine's `keep` matches exact spans. Unlike `connectedKeepList`, this does not
 * depend on what is connected (a user names OneDrive before connecting it), and it never
 * feeds `connectedUrlHosts`: a host is exempted only for a CONNECTED service.
 */
export function integrationProductNames(): string[] {
  if (cached) return cached;
  const out = new Set<string>();
  const add = (n?: string) => {
    const v = n?.trim();
    if (!v || v.length < 2) return;
    out.add(v);
    const spaced = spacedVariant(v);
    if (spaced) out.add(spaced);
  };
  for (const c of MCP_CONNECTORS) {
    if (c.transport === "builtin") continue; // « Navigateur » is a word, not a product
    add(c.name);
    for (const l of LOCALES) add(getMessages(l).connectorCatalog.connectors[c.id]?.name);
  }
  cached = [...out];
  return cached;
}

// `· id:XYZ` closing a line — the listing convention of the DIRECT connectors' own
// renderers (`@openmasq/connectors`: `renderRemoteList`, OneDrive/Drive/SharePoint
// search, Slack channels, Tasks).
const LISTED_ID = /· id:(\S+)[ \t]*$/gm;

// A record id under a JSON id KEY in a catalogue connector's result: `"id"`, `"page_id"`,
// `"parentId"`… with a UUID value (dashed, or Notion's 32-hex form). A key naming a secret
// (`api_key_id`, `token_id`…) never qualifies.
const JSON_UUID_ID =
  /"(id|[a-z][a-z0-9_]*_id|[a-z][a-zA-Z0-9]*Id)"\s*:\s*"([0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12})"/g;
const SECRET_KEY = /key|token|secret|session|auth|password/i;

/**
 * The record ids a CATALOGUE connector hands the model. They are the service's ADDRESSING,
 * not data — but they look like API tokens, and that category is on at every level: the
 * model got a fake id (or, on a direct connector, a 404 after one mangled character).
 * Spared ONLY:
 * - for a tool of a connector in the CATALOGUE — a server the user added is unknown, so
 *   nothing of its output is presumed harmless;
 * - in two positions: the `· id:` closing of our DIRECT connectors' own listings (whole id
 *   and its segments — the engine may flag `A1B2…` inside `A1B2…!1234`), and a UUID under a
 *   JSON id key in any catalogue connector's result (Notion's `"id"`);
 * - never a PROTECTED value (vault real, Coffre/forced, extra secret): fail-closed.
 */
export function connectorIdKeep(
  tool: string | undefined,
  text: string,
  protectedValues: readonly string[],
): string[] {
  if (!tool) return [];
  const px = tool.indexOf("__");
  if (px <= 0) return [];
  const connector = findConnector(connectorOfServer(tool.slice(0, px)));
  if (!connector || connector.transport === "builtin") return [];
  const guarded = protectedValues.map((v) => v.toLowerCase()).filter(Boolean);
  const touches = (v: string) => {
    const lc = v.toLowerCase();
    return guarded.some((g) => g.includes(lc) || lc.includes(g));
  };
  const out = new Set<string>();
  const add = (v: string) => {
    if (!touches(v)) out.add(v);
  };
  if (connector.transport === "direct") {
    for (const m of text.matchAll(LISTED_ID)) {
      const id = m[1];
      for (const v of [id, ...id.split(/[^A-Za-z0-9]+/).filter((s) => s.length >= 6)]) add(v);
    }
  }
  for (const m of text.matchAll(JSON_UUID_ID)) if (!SECRET_KEY.test(m[1])) add(m[2]);
  return [...out];
}
