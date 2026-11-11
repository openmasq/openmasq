import { markAdopted, postureTag, postureVerdict } from "./postureSeal";
import type { ServerSpec } from "./persist";

/**
 * A connector spec is stored plain, and two of its fields ARE the boundary: `url` (where a
 * stored bearer or OAuth token is sent) and `params` (the folders the file tool reaches, which
 * `mcp:set-dirs` then treats as already granted). Edited on disk they were read back as the
 * user's choice. Each spec is tagged when the app writes it (`postureSeal.ts`); a spec whose
 * tag is missing or wrong comes back WITHOUT those fields and marked `altered`, so nothing
 * connects with it: the user removes it and connects again (`server/connect.ts`).
 */
const KIND = "mcp-spec";

/** What the tag covers: the fields that decide WHERE a connection goes and WHAT it reaches.
 *  Labels and account keys are display and dedupe, rewritten by the app at will. */
const posture = (s: ServerSpec) => ({ id: s.id, kind: s.kind, url: s.url, catalogId: s.catalogId, params: s.params });

export const sealSpec = (spec: ServerSpec): string | null => postureTag(KIND, posture(spec));

export interface VettedSpecs {
  servers: ServerSpec[];
  /** Set when the store was just adopted: the caller persists these tags. */
  seals?: Record<string, string>;
}

/** `store`: this account's store name, or null when signed out (memory only, written by this
 *  process: nothing to verify). */
export function vetSpecs(store: string | null, servers: ServerSpec[], seals: Record<string, string>): VettedSpecs {
  if (!store) return { servers };
  const state = postureVerdict(store, KIND, null, undefined);
  if (state === "off") return { servers };
  if (state === "adopt") {
    // a store from before the tag: taken as it stands, ONCE, and sealed
    const next: Record<string, string> = {};
    for (const s of servers) {
      const tag = sealSpec(s);
      if (tag) next[s.id] = tag;
    }
    markAdopted(store);
    return { servers, seals: next };
  }
  return {
    servers: servers.map((s) =>
      postureVerdict(store, KIND, posture(s), seals[s.id]) === "ok" ? s : { ...s, url: undefined, params: undefined, altered: true },
    ),
  };
}
