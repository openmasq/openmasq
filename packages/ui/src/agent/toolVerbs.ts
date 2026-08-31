/**
 * **How a tool's name is READ** — UI side.
 *
 * The verb vocabulary itself (READ/WRITE/DESTRUCTIVE/COMPOUND) and the read-vs-write
 * classifier live in `@openmasq/catalog/mcp` (`writeVocabulary.ts`), the
 * ONE home (rule 9): the main process's write-gate (`apps/desktop` `writeGate.ts`)
 * judges on the SAME list, and the two copies had drifted — disjoint verbs, opposite
 * defaults. All that's left here is what's specific to the UI: stripping the vendor
 * name, consumed only by the prefetch (`isConfidentReadOnly`).
 */

export { READ_VERB, WRITE_VERB, DESTRUCTIVE_VERB, COMPOUND_WRITE } from "@openmasq/catalog/mcp";

/**
 * The BARE name stripped of the VENDOR name when it repeats it — `notion__notion-fetch` →
 * `fetch`, `slack__slack_read_canvas` → `read_canvas`.
 *
 * Many MCP servers prefix each of their tools with their own name, which the
 * client then re-prefixes. With `READ_VERB` anchored at the HEAD, the verb ended up
 * behind a brand name and NO Notion tool (10/10) nor Slack tool (9/9) passed as
 * a read — so neither parallel prefetch, nor the "emit them together" nudge
 * (`batchReads`), which read the SAME predicate, fired.
 *
 * ⚠️ This is NOT a relaxation, and must never become one: the invariant remains
 * "the HEAD of the name is the command" — we only strip a namespace that isn't
 * a command. The stripping only feeds the read-verb test — the destructive and
 * compound checks still operate on the FULL name.
 */
export function bareWithoutVendor(name: string): string {
  const i = name.indexOf("__");
  if (i < 0) return name;
  const id = name.slice(0, i);
  const bare = name.slice(i + 2);
  // `-` and `_` are interchangeable from one server to another (`notion-fetch` vs
  // `slack_read_file`), and an empty id must not strip everything.
  if (!id) return bare;
  const re = new RegExp(`^${id.replace(/[^a-z0-9]/gi, "[-_]")}[-_]+`, "i");
  return bare.replace(re, "");
}
