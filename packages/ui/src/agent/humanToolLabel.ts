/**
 * **THE one place a raw tool name becomes words the user reads**, in the UI language (`t`).
 * A tool name (`browser_navigate`, `stripe_api_search`) is developer vocabulary; every surface that shows the user what
 * the agent is doing goes through here — the trace row (`components/ToolTrace/`) and the
 * live loader (`toolActionLabel`, which composes this). The raw name survives only where
 * it is the POINT: the row's `title` tooltip, the write-confirm card's authorisation
 * target, and the connector's tool catalogue in Réglages.
 *
 * ⚠️ **The verb is not always the prefix.** `stripe_api_search` / `stripe_api_read`
 * put the vendor and its API boilerplate FIRST, so a prefix-anchored match found no
 * verb and the label fell through to the raw name with its underscores swapped for
 * spaces — the developer name with extra steps. The name is therefore TOKENISED and
 * the verb looked up among the WORDS, wherever the server chose to put it.
 *
 * It lives in `agent/` beside `toolActionLabel` rather than in the trace folder: both
 * speak the same vocabulary, and the leaf importing the brain is the direction the
 * tiers allow (the reverse would be an up-tree import — and a cycle, since the live
 * label composes this one).
 */
import type { Messages } from "@openmasq/i18n";

/** The catalogue's tool tables, keyed on ids this file owns (`tsc` pins both sides). */
type Tools = Messages["runtime"]["tools"];
type InterceptedToolId = keyof Tools["intercepted"];
type ToolVerbId = keyof Tools["verbs"];
type ToolNounActionId = keyof Tools["nounActions"];
type ToolNoun = keyof Tools["nouns"];
export type BrowserGesture = keyof Tools["browserRow"];

/** Strip a multi-account instance suffix (`gmail--a1b2` → `gmail`). ONE definition,
 *  consumed by every label: the row drops the connector's own name with it, and
 *  `toolActionLabel` keys its per-connector sentences on it. */
export function baseConnector(prefix: string): string {
  return prefix.replace(/--[0-9a-f]{3,}$/i, "");
}

/**
 * The app's OWN intercepted tools — never proxied to a server, so their names are ours to
 * translate and there is nothing to guess.
 *
 * ⚠️ They must be matched BEFORE the generic word walk, which mangles every one of them:
 * `web_fetch_many` came out « Lecture · many » (the batch marker read as the object),
 * `load_tools` came out « load » ("tools" is boilerplate everywhere else, so it was
 * stripped and left a bare verb), `memory_search` « Recherche · memory ». A generic rule
 * has no business guessing at a vocabulary we define. The WORDS live in the catalogue
 * (`t.runtime.tools.intercepted`); `run_python` is labelled by both ends of what it does:
 * it calculates, and it generates the files handed back to the user.
 */
export function interceptedLabel(tool: string, t: Messages): string | undefined {
  const own = t.runtime.tools.intercepted;
  return Object.hasOwn(own, tool) ? own[tool as InterceptedToolId] : undefined;
}

/** Word → action family, looked up per WORD (never as a prefix). The label is the
 *  catalogue's (`t.runtime.tools.verbs`). */
const VERBS: Record<string, ToolVerbId> = {
  search: "search", find: "search", query: "search", lookup: "search",
  list: "read", get: "read", read: "read", fetch: "read", show: "read",
  retrieve: "read", describe: "read", view: "read",
  create: "create", add: "create", insert: "create", new: "create",
  update: "update", edit: "update", modify: "update", patch: "update",
  set: "update", move: "update", rename: "update", write: "update",
  send: "send", post: "send", reply: "send", publish: "send", share: "send",
  delete: "delete", remove: "delete", archive: "delete", purge: "delete",
  cancel: "cancel",
  run: "run", execute: "run", exec: "run",
  download: "export", export: "export",
  upload: "import", import: "import",
  duplicate: "duplicate", copy: "duplicate",
};

/** A verb that DESTROYS outranks a read verb sitting earlier in the name: labelling
 *  `get_and_purge` « Lecture » understates what the row did. (The security
 *  classification is `agent/mcpAgentClassify.ts`' job — this is only the label.) */
const DESTRUCTIVE = new Set(["delete", "remove", "purge", "archive", "cancel"]);

/** A name with NO verb at all is usually one of these — say what it looks at rather
 *  than echo the bare noun. */
const NOUN_ACTIONS: Record<string, ToolNounActionId> = {
  detail: "details", details: "details", info: "details", about: "details",
  status: "status", health: "status", state: "status",
  me: "account", whoami: "account", profile: "account", account: "account",
  auth: "connect", authenticate: "connect", login: "connect", connect: "connect",
};

/** The OBJECT half: only unambiguous single-word translations live in the catalogue
 *  (`t.runtime.tools.nouns`) — an unmapped word stays as it is, which already reads far
 *  better than the snake_case it came from. */
function noun(w: string, t: Messages): string {
  const nouns = t.runtime.tools.nouns;
  return Object.hasOwn(nouns, w) ? nouns[w as ToolNoun] : w;
}

/** Boilerplate every server sprinkles over its tool names, meaning nothing to the
 *  user. The CONNECTOR's own name goes with it: the card above the row already says
 *  « Stripe », so repeating it on every row is noise, not information. */
const NOISE = new Set(["api", "mcp", "tool", "tools", "v1", "v2", "and", "by", "for"]);

/** The browser's gestures, by family — the same families as `toolActionLabel`'s live
 *  line, but as short row NOUNS. */
export function browserGesture(tool: string): BrowserGesture {
  if (/search/.test(tool)) return "search";
  if (/navigate|goto|open/.test(tool)) return "open";
  if (/click|type|fill|press|select|drag|upload|submit/.test(tool)) return "act";
  if (/snapshot|screenshot|read|content|text|accessib/.test(tool)) return "read";
  if (/tab/.test(tool)) return "tabs";
  if (/close/.test(tool)) return "close";
  return "browse";
}

/** Split a tool name into lowercase words across EVERY convention a server may use:
 *  `snake_case`, `kebab-case`, `dotted.paths` and `camelCase`. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

export function humanToolLabel(server: string, tool: string, t: Messages): string {
  const own = interceptedLabel(tool, t);
  if (own) return own;
  const tt = t.runtime.tools;
  if (server === "browser" || /^browser/.test(tool)) {
    return tt.browserRow[browserGesture(tool.replace(/^browser_/, ""))];
  }

  const all = words(tool);
  const connectorWords = new Set(words(baseConnector(server)));
  const kept = all.filter((w) => !NOISE.has(w) && !connectorWords.has(w));

  const verb = kept.find((w) => DESTRUCTIVE.has(w)) ?? kept.find((w) => w in VERBS);
  if (verb) {
    const object = kept
      .filter((w) => w !== verb && !(w in VERBS))
      .map((w) => noun(w, t))
      .join(" ");
    const label = tt.verbs[VERBS[verb]!];
    return object ? `${label} · ${object}` : label;
  }

  for (const w of kept) if (w in NOUN_ACTIONS) return tt.nounActions[NOUN_ACTIONS[w]!];

  // Unknown shape — the cleaned words beat the raw snake_case. Fall back to the FULL
  // name when stripping left nothing (a tool named only after its own connector).
  return (kept.length ? kept : all).map((w) => noun(w, t)).join(" ");
}
