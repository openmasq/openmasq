// RE-READING `proxy.json`'s `mcp` section while the proxy runs — and re-reading nothing else
// in that file.
//
// A masking level can move under a running proxy: the `l` key already moves the global one,
// and a connector's own is now editable. A port or a host cannot — there is a socket already
// bound to it — and a client's flags cannot either, since the wrapped tool was launched with
// them. So the reload is deliberately NARROW: the `mcp` section, nothing more. A file that
// changed only its `run` block is read, found equal where it matters, and reported as no
// change at all.
//
// ⚠️ It fails CLOSED on a broken file. A half-written `proxy.json` — an editor saving, a
// script mid-write — must leave the run masking exactly as it was, never fall back to a
// default: "the file is unreadable" and "the file says mask nothing" are the same bytes to a
// parser and opposite things to a user.
import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG_FILE, parseConfigFile } from "../../config/file.js";
import type { MaskerSet } from "../../lib/maskers.js";
import { type McpPolicy, parseMcpPolicy } from "./policy.js";

export interface PolicyReloadDeps {
  maskers: MaskerSet;
  /** The live policy the bridge reads for its write gate — MUTATED in place, so a `writes`
   *  edited in the file reaches the gate without the bridge being rebuilt. */
  policy: McpPolicy;
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  /** Injected by tests. */
  path?: string;
  read?: (p: string) => string;
}

/**
 * The `remask` hook `reload.ts` calls. Returns the server ids whose masking actually moved —
 * empty when the file changed in ways this section does not care about, which is most saves.
 */
export function createPolicyReload(deps: PolicyReloadDeps): () => string[] {
  const path = deps.path ?? DEFAULT_CONFIG_FILE();
  const read = deps.read ?? ((p: string) => readFileSync(p, "utf8"));
  return () => {
    let next: McpPolicy;
    try {
      next = parseMcpPolicy(parseConfigFile(read(path), path).mcp ?? {}, `${path} › mcp`);
    } catch (err) {
      // Said once, and the run keeps what it had. A level that silently reverted to the
      // default would be the worst outcome of a typo.
      deps.note(
        `${path} not applied, masking unchanged: ${err instanceof Error ? err.message : String(err)}`,
        "warn",
      );
      return [];
    }
    const moved = deps.maskers.repoint(next);
    // The write gate reads this object, so it is replaced field by field rather than
    // reassigned — the bridge holds the reference it was given at start.
    for (const id of Object.keys(deps.policy)) delete deps.policy[id];
    Object.assign(deps.policy, next);
    return moved;
  };
}
