// The run's maskers: ONE for the chat and the servers with no policy of their own — it reads
// the global options at request time, so the `l` key re-points it — and one per server whose
// `proxy.json` entry sets a level, kinds or keeps of its own. They share what must be shared
// (the on-device model, the always-masked terms, the secrets) and differ only in the level
// arithmetic, which is the catalogue's.
//
// A server's masker never lowers what the conversation already holds: every masker writes
// the SAME session vault, and a vault is replayed before anything is detected, so a name a
// `strict` server vaulted stays masked in a `standard` chat (`masker.test.ts`).
import type { RedactionLevel } from "@openmasq/catalog";
import type { ProxyConfig } from "../config/config.js";
import type { McpPolicy, ServerPolicy } from "../features/mcp/policy.js";
import { overridesMasking } from "../features/mcp/policy.js";
import {
  createMasker,
  disabledKindsFor,
  levelNeedsModel,
  type Masker,
  type MaskerOptions,
} from "./masker.js";
import type { DetectLocal } from "./ner.js";

export interface MaskerSet {
  /** The chat's options — mutable, read per request (the `l` key). */
  global: MaskerOptions;
  masker: Masker;
  /** The masker a server's results go through: its own when its policy shapes one. */
  forServer(id: string): Masker;
  /** The level a server's results are masked at, for the card. */
  levelOf(id: string): RedactionLevel;
  /** Does ANY masker of the set ask for the on-device model? Fail closed on the union. */
  needsModel(): boolean;
  /** The model, once loaded, reaches every masker. */
  setDetect(detect: DetectLocal): void;
}

export function createMaskerSet(config: ProxyConfig, policy: McpPolicy = {}): MaskerSet {
  const global: MaskerOptions = {
    level: config.level,
    detectLocal: undefined,
    keep: config.keep,
    disabledKinds: disabledKindsFor(config.level, config.disabledKinds),
    forced: config.always,
    secrets: config.secrets,
  };
  const own = new Map<string, { opts: MaskerOptions; masker: Masker; level: RedactionLevel }>();
  for (const [id, p] of Object.entries(policy)) {
    if (!overridesMasking(p)) continue;
    const level = p.level ?? config.level;
    const opts: MaskerOptions = {
      ...global,
      level,
      // The run's own disables and keeps still apply: a server's entry ADDS to them.
      keep: [...config.keep, ...(p.keep ?? [])],
      disabledKinds: disabledKindsFor(level, [...config.disabledKinds, ...(p.disable ?? [])]),
    };
    own.set(id, { opts, masker: createMasker(opts), level });
  }
  const masker = createMasker(global);
  return {
    global,
    masker,
    forServer: (id) => own.get(id)?.masker ?? masker,
    levelOf: (id) => own.get(id)?.level ?? global.level ?? config.level,
    needsModel: () =>
      levelNeedsModel(global.level ?? config.level, config.disabledKinds) ||
      [...own.values()].some((o) => levelNeedsModel(o.level, o.opts.disabledKinds)),
    setDetect: (detect) => {
      global.detectLocal = detect;
      for (const o of own.values()) o.opts.detectLocal = detect;
    },
  };
}

/** The write policy a server's tools are gated by: its own, or the run's. */
export const writesFor = (policy: McpPolicy, id: string, fallback: ServerPolicy["writes"]) =>
  policy[id]?.writes ?? fallback;
