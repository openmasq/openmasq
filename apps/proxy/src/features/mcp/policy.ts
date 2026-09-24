// The per-server policy of `proxy.json`'s `mcp` section: for each server id, which SIDE
// provides it, and how its tool results are masked and its writes gated.
//
//   "mcp": {
//     "notion":     { "source": "openmasq", "level": "strict", "writes": "deny" },
//     "github":     { "source": "client",   "level": "standard" },
//     "filesystem": { "source": "off" }
//   }
//
// `source` says whose server it is: `openmasq` — OURS (declared in the servers file), and the
// wrapped client's same-named one is set aside; `client` — THEIRS, taken over through the
// proxy even when we have one; `off` — neither, the tool is absent from the run. Absent, the
// rule is the one adoption already had: ours when declared, theirs otherwise. What `client`
// never means is "the client speaks to it directly": that path bypasses the mask, and the
// exclusivity that closes it (`start.ts`) is not something a file can reopen.
//
// `level`, `disable` and `keep` shape the masker THAT server's results go through
// (`lib/maskers.ts`); `writes` is its own gate. What a stricter server puts in the session's
// vault stays masked for the whole conversation, the chat's own level notwithstanding —
// the vault is replayed before anything is detected (`lib/masker.test.ts` pins it).
import {
  overridesMasking as masksDifferently,
  type ConnectorMasking,
  type RedactionLevel,
} from "@openmasq/catalog";
import { choices, closest } from "../../config/options.js";
import { LEVELS, WRITE_POLICIES, type WritePolicy } from "../../config/schema.js";

export type Side = "openmasq" | "client" | "off";
export const SIDES: readonly Side[] = ["openmasq", "client", "off"];

/**
 * The MASKING half is `@openmasq/catalog`'s `ConnectorMasking`, not a shape of our own: the
 * desktop's panes edit the same three fields (rule 9). This file adds only the two keys that
 * are the PROXY's alone — which side provides a server, and how its writes are gated.
 */
export interface ServerPolicy extends ConnectorMasking {
  source?: Side;
  writes?: WritePolicy;
}

export type McpPolicy = Record<string, ServerPolicy>;

const KEYS = ["source", "level", "disable", "keep", "writes"] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Strict, like the rest of the file: an unknown key or a bad value refuses the start — a
 *  policy that is silently not applied is worse than none. */
export function parseMcpPolicy(
  raw: Record<string, unknown>,
  where = "proxy.json › mcp",
): McpPolicy {
  const out: McpPolicy = {};
  for (const [id, entry] of Object.entries(raw)) {
    const at = `${where}.${id}`;
    if (!isRecord(entry)) throw new Error(`${at} must be an object`);
    const p: ServerPolicy = {};
    for (const [k, v] of Object.entries(entry)) {
      switch (k) {
        case "source":
          p.source = oneOf(v, SIDES, `${at}.source`) as Side;
          break;
        case "level":
          p.level = oneOf(v, LEVELS, `${at}.level`) as RedactionLevel;
          break;
        case "writes":
          p.writes = oneOf(v, WRITE_POLICIES, `${at}.writes`) as WritePolicy;
          break;
        case "disable":
        case "keep":
          if (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
            throw new Error(`${at}.${k} must be an array of strings`);
          p[k] = v as string[];
          break;
        default: {
          const near = closest(k, KEYS);
          throw new Error(`${at}: unknown key "${k}"${near ? ` — did you mean "${near}"?` : ""}`);
        }
      }
    }
    out[id] = p;
  }
  return out;
}

function oneOf(v: unknown, values: readonly string[], who: string): string {
  if (typeof v !== "string" || !values.includes(v))
    throw new Error(`${who} is ${choices(values)}, not ${JSON.stringify(v)}`);
  return v;
}

/** Does any server ask for a masker of its own (a level, kinds or keeps that differ)? The
 *  catalogue answers it: `source` and `writes` change nothing about how a result is masked,
 *  so a server that carries only those must keep sharing the global masker — two identical
 *  maskers would mint two identities for one value. */
export const overridesMasking = (p: ServerPolicy): boolean => masksDifferently(p);

/** One line per server for the card and `mcp status`: `strict, writes deny, ours` — commas,
 *  because the card already separates servers with `·`. */
export function describePolicy(p: ServerPolicy): string {
  const parts: string[] = [];
  if (p.level) parts.push(p.level);
  if (p.disable?.length) parts.push(`${p.disable.join(", ")} in clear`);
  if (p.keep?.length) parts.push(`${p.keep.length} kept`);
  if (p.writes) parts.push(`writes ${p.writes}`);
  if (p.source)
    parts.push(p.source === "openmasq" ? "ours" : p.source === "client" ? "the client's" : "off");
  return parts.join(", ");
}
