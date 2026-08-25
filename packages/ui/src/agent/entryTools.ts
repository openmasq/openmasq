import type { McpTool } from "@openmasq/mcp";
import { isWebBrowseEntryTool } from "../state/browserPolicy";
import { looksWebIntent } from "./mcpAgentClassify";

/**
 * ENTRY-tool rescues for the routing pre-pass — additive, deterministic, and bounded.
 *
 * The router is itself a model call, so it MISSES: it prunes the one tool the request
 * actually needed, or (observed) picks nothing at all. What it leaves behind is a
 * `load_tools(x) → x_tool` chain a weak model won't perform — it narrates the intent and
 * stops. So a family's cheap ENTRY tools are forced back in, on evidence, never on a
 * guess. Extracted out of `mcpAgent.ts` because that file is over the cap: a rescue is
 * pure list arithmetic and has no business in the loop.
 */

/**
 * The filesystem tools a « what do I have / find me X » request cannot proceed without.
 *
 * Measured (01/08/2026): on « liste les documents fiscaux » the router kept
 * `search_files` and NOT `list_directory` — so the model could only match a SUBSTRING it
 * had to guess, guessed « fiscal », got nothing, and answered that no fiscal document
 * existed. It had no way to enumerate, and no way to ask by meaning.
 *
 * ⚠️ Matched on the BARE name, unlike a connector-keyed policy. That is deliberate and
 * safe HERE, and would not be in a gate (`../CLAUDE.md`: never a bare-name class for
 * `isGovernedWebTool`): this only widens what is OFFERED — every rescued tool still goes
 * through routing's budget cap and through every call-time gate — and the names are the
 * standard `@modelcontextprotocol/server-filesystem` ones, so a third-party filesystem
 * server gets the same rescue, which is exactly what we want.
 */
const FS_ENTRY = new Set(["find_files", "list_directory", "list_allowed_directories"]);

/** Any filesystem tool at all — the EVIDENCE that this request is about files. */
const FS_ANY = new Set([...FS_ENTRY, "search_files", "read_file", "read_document", "get_file_info"]);

/** The tool name without its connector prefix. Same derivation as the catalog's — the
 *  FIRST `__` is the connector boundary. No `canonicalToolName` here: these names come
 *  from the ADVERTISED list, not from the model, so there is nothing to resolve. */
const bare = (name: string): string => {
  const i = name.indexOf("__");
  return i > 0 ? name.slice(i + 2) : name;
};

export function isFsEntryTool(name: string): boolean {
  return FS_ENTRY.has(bare(name));
}

/** True when the ROUTER itself judged the request filesystem-shaped. Keyed on its own
 *  pick rather than on a phrase in the text: the router already read the request, and a
 *  second heuristic over the same words would only add false positives. */
export function routerSawFiles(kept: readonly McpTool[]): boolean {
  return kept.some((t) => FS_ANY.has(bare(t.name)));
}

/**
 * Complete a routing pick with the entry tools it dropped. Returns a NEW array; never
 * removes anything, never reorders what routing kept.
 *
 * - WEB: on a `looksWebIntent` request, the browse entry pair (navigate + read).
 * - FILES: when routing kept ANY filesystem tool, the enumerate/find entry set — three
 *   schemas, so the cost is the same order as the web rescue.
 *
 * No-op when the family isn't connected (nothing in `all` matches) or when routing
 * already kept them.
 */
export function rescueEntryTools(
  kept: readonly McpTool[],
  all: readonly McpTool[],
  userText: string,
): McpTool[] {
  const out = [...kept];
  const names = new Set(out.map((t) => t.name));
  const add = (pred: (name: string) => boolean): void => {
    for (const t of all) {
      if (!names.has(t.name) && pred(t.name)) {
        out.push(t);
        names.add(t.name);
      }
    }
  };
  if (looksWebIntent(userText)) add(isWebBrowseEntryTool);
  if (routerSawFiles(kept)) add(isFsEntryTool);
  return out;
}
