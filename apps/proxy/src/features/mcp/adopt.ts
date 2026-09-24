// Taking over the client's own integrations. Exclusivity without this would be a downgrade:
// the client's servers are switched off for the run, so unless we pick them up the session
// simply loses Notion and the CRM. Adoption is what makes the swap invisible — the same
// tools, reached through the mask.
//
// It works on what `own.ts` learned (a declaration read, or the client's own answer) and
// never writes anything back. An entry that cannot be used is REPORTED, one by one: a single
// malformed server must not cost the user every other.
import type { OwnServer } from "./clients/index.js";
import { parseServerMap, type ServerSpec } from "./servers.js";

export interface AdoptEvents {
  /** A server we took over, and the scope it came from. */
  onAdopt?: (id: string, scope: string) => void;
  /** One we could not: an id already declared, an unusable entry. `why` names no credential. */
  onSkip?: (id: string, why: string) => void;
}

/**
 * Every server the client has, skipping any id the user already gave us: an explicit
 * `--mcp-config` entry is the one that wins, because it is the one whose credentials we were
 * handed on purpose.
 */
export function adoptFrom(
  own: OwnServer[],
  declared: ServerSpec[],
  events: AdoptEvents = {},
  /** Ids the policy keeps out of adoption (`source: openmasq` or `off`) — already said. */
  exclude: ReadonlySet<string> = new Set(),
): ServerSpec[] {
  const taken = new Set(declared.map((s) => s.id));
  const adopted: ServerSpec[] = [];
  for (const server of own) {
    if (exclude.has(server.id)) continue;
    if (taken.has(server.id)) {
      events.onSkip?.(server.id, "already declared — yours wins");
      continue;
    }
    try {
      const [spec] = parseServerMap({ [server.id]: server.raw });
      if (!spec) continue; // disabled in the client's own config
      taken.add(server.id);
      adopted.push(spec);
      events.onAdopt?.(server.id, server.scope);
    } catch (err) {
      events.onSkip?.(server.id, err instanceof Error ? err.message : String(err));
    }
  }
  return adopted;
}
