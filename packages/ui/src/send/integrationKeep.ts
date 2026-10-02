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

/**
 * The item ids a DIRECT connector's listing hands the model. They are the service's
 * ADDRESSING (`01BYE5RZ…`, `A1B2…!1234`), not data — but they look like API tokens, and
 * that category is on at every level: the model got a fake id, and one mangled character
 * on the way back was a 404 from the service. Spared ONLY:
 * - for a tool of a `direct` catalogue connector — our own renderer wrote the line, so the
 *   shape is ours (a remote server's free text never qualifies);
 * - in the `· id:` closing position, whole id and its segments (the engine may flag
 *   `A1B2…` inside `A1B2…!1234`);
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
  if (findConnector(connectorOfServer(tool.slice(0, px)))?.transport !== "direct") return [];
  const guarded = protectedValues.map((v) => v.toLowerCase()).filter(Boolean);
  const touches = (v: string) => {
    const lc = v.toLowerCase();
    return guarded.some((g) => g.includes(lc) || lc.includes(g));
  };
  const out = new Set<string>();
  for (const m of text.matchAll(LISTED_ID)) {
    const id = m[1];
    for (const v of [id, ...id.split(/[^A-Za-z0-9]+/).filter((s) => s.length >= 6)])
      if (!touches(v)) out.add(v);
  }
  return [...out];
}
