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
  /** What a server actually masks with — the run's settings already composed in. Read by the
   *  card and the console, which must show the EFFECTIVE masking, not the file's shorthand. */
  optionsOf(id: string): MaskerOptions | undefined;
  /** Does ANY masker of the set ask for the on-device model? Fail closed on the union. */
  needsModel(): boolean;
  /** The model, once loaded, reaches every masker. */
  setDetect(detect: DetectLocal): void;
  /**
   * Re-point the per-server maskers at a NEW policy, without rebuilding the set.
   *
   * ⚠️ Re-pointed, never rebuilt — the same reason the `l` key re-points the global options
   * (`lib/dials.ts`). A masker reads its options at request time, so mutating them applies to
   * the next call and to nothing in flight; handing out a NEW masker instead would leave any
   * request already inside the old one writing to a vault the next one does not know, and a
   * value would come back with a fake nothing can reverse.
   *
   * Returns the ids whose masking actually moved, so a caller can say what changed rather
   * than announce a reload that did nothing.
   */
  repoint(policy: McpPolicy): string[];
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
  /** One server's options, from its policy entry and the run's own. The ONE place that
   *  composition is written — `repoint` must compose exactly as the first build did, or a
   *  reload would quietly mean something different from a start. */
  function optsFor(p: ServerPolicy): { opts: MaskerOptions; level: RedactionLevel } {
    const level = p.level ?? config.level;
    return {
      level,
      opts: {
        ...global,
        level,
        // The run's own disables and keeps still apply: a server's entry ADDS to them.
        keep: [...config.keep, ...(p.keep ?? [])],
        disabledKinds: disabledKindsFor(level, [...config.disabledKinds, ...(p.disable ?? [])]),
      },
    };
  }

  const masker = createMasker(global);
  const set: MaskerSet = {
    global,
    masker,
    forServer: (id) => own.get(id)?.masker ?? masker,
    levelOf: (id) => own.get(id)?.level ?? global.level ?? config.level,
    optionsOf: (id) => own.get(id)?.opts ?? global,
    needsModel: () =>
      levelNeedsModel(global.level ?? config.level, config.disabledKinds) ||
      [...own.values()].some((o) => levelNeedsModel(o.level, o.opts.disabledKinds)),
    setDetect: (detect) => {
      global.detectLocal = detect;
      for (const o of own.values()) o.opts.detectLocal = detect;
    },
    repoint: (next) => {
      const moved: string[] = [];
      for (const [id, p] of Object.entries(next)) {
        const { opts, level } = optsFor(p);
        const had = own.get(id);
        if (!overridesMasking(p)) {
          // Back to the global masker. Dropping the entry is what makes that true, and it
          // must happen even when the id stays in the file with only a `source` left.
          if (had) moved.push(id);
          own.delete(id);
          continue;
        }
        if (!had) {
          own.set(id, { opts, masker: createMasker(opts), level });
          moved.push(id);
          continue;
        }
        if (sameMasking(had.opts, opts) && had.level === level) continue;
        // The object the masker already holds, mutated — see `repoint`'s header.
        Object.assign(had.opts, opts);
        had.level = level;
        moved.push(id);
      }
      for (const id of [...own.keys()]) {
        if (id in next) continue;
        own.delete(id);
        moved.push(id);
      }
      return moved;
    },
  };
  // The first build IS a repoint from nothing: one composition path, so a reload can never
  // mean something a start did not.
  set.repoint(policy);
  return set;
}

/** Do two option sets mask the same way? Compared on what the masker READS, so a rewritten
 *  file that says the same thing reports no change and the card stays quiet. */
const sameMasking = (a: MaskerOptions, b: MaskerOptions): boolean =>
  a.level === b.level && same(a.keep, b.keep) && same(a.disabledKinds, b.disabledKinds);

const same = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean =>
  (a ?? []).length === (b ?? []).length && (a ?? []).every((v, i) => v === (b ?? [])[i]);

/** The write policy a server's tools are gated by: its own, or the run's. */
export const writesFor = (policy: McpPolicy, id: string, fallback: ServerPolicy["writes"]) =>
  policy[id]?.writes ?? fallback;
