// APPLYING a masking change the live view asked for: gate it, write it, apply it.
//
// Three steps and an order that matters. The gate runs FIRST (`maskingGate.ts`), so a
// refusal leaves the file untouched — a change nobody approved must not be on disk waiting
// for the next restart to pick it up. The file is written SECOND, because it is what
// survives the run and what the operator can read. The maskers are re-pointed LAST and
// directly, rather than being left to the watcher: the watcher is debounced, and a page that
// said "done" while the next call still masked the old way would be lying for a third of a
// second.
//
// ⚠️ The file is REWRITTEN AROUND the `mcp` section, never regenerated. `proxy.json` is the
// operator's own file: its `run` block, its `clients` block, its key order and anything a
// future version adds are none of this function's business, and a page that flattened them
// would be a worse bug than the one it fixed.
import { readFileSync, writeFileSync } from "node:fs";
import type { RedactionLevel } from "@openmasq/catalog";
import { LEVELS } from "../../config/schema.js";
import { DEFAULT_CONFIG_FILE } from "../../config/file.js";
import { type McpPolicy, parseMcpPolicy } from "../mcp/policy.js";
import type { GateVerdict, MaskingChange } from "./maskingGate.js";

export interface ApplyDeps {
  /** The asymmetric gate — tightening passes, loosening asks the terminal. */
  gate: (c: MaskingChange) => Promise<GateVerdict>;
  /** The run's own level, which a connector saying nothing follows. */
  defaultLevel: () => RedactionLevel;
  /** Bring the maskers to what the file now says; returns the ids that moved. */
  remask: () => string[];
  path?: string;
  read?: (p: string) => string;
  write?: (p: string, text: string) => void;
}

export type ApplyResult = { ok: true; moved: string[] } | { ok: false; why: string };

/** What the page may ask for. `level` is a STRING here, not a `RedactionLevel`: it arrives
 *  from a browser, and narrowing it is this module's job — see `apply`, which refuses an
 *  unknown one rather than letting it read as "follow the default", which would be a
 *  loosening nobody asked for. `null` is how a picker says "follow the default" on purpose. */
export interface MaskingRequest {
  level?: string | null;
  disable?: string[];
  keep?: string[];
}

/** What a connector is masked at right now, from the file, with the run's level folded in for
 *  the fields it does not set. The gate compares two of these. */
function current(policy: McpPolicy, id: string, level: RedactionLevel) {
  const p = policy[id] ?? {};
  return { level: p.level ?? level, disable: p.disable ?? [], keep: p.keep ?? [] };
}

export function createApplyMasking(deps: ApplyDeps) {
  const path = deps.path ?? DEFAULT_CONFIG_FILE();
  const read = deps.read ?? ((p: string) => readFileSync(p, "utf8"));
  const write = deps.write ?? ((p: string, t: string) => writeFileSync(p, t));

  return async function apply(connector: string, next: MaskingRequest): Promise<ApplyResult> {
    if (next.level != null && !LEVELS.includes(next.level as RedactionLevel))
      return { ok: false, why: `unknown level ${JSON.stringify(next.level)}` };
    const wanted = next.level as RedactionLevel | null | undefined;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(read(path)) as Record<string, unknown>;
      if (typeof doc !== "object" || doc === null || Array.isArray(doc))
        throw new Error("the config must be a JSON object");
    } catch (err) {
      // Nothing is written and nothing is applied: a file we cannot read is a file we must
      // not overwrite, and its contents are the operator's.
      return { ok: false, why: `${path} could not be read: ${msg(err)}` };
    }

    const section = (doc.mcp ?? {}) as Record<string, unknown>;
    let policy: McpPolicy;
    try {
      policy = parseMcpPolicy(section, `${path} › mcp`);
    } catch (err) {
      return { ok: false, why: `${path} › mcp is not valid: ${msg(err)}` };
    }

    const level = deps.defaultLevel();
    const before = current(policy, connector, level);
    const after = {
      level: wanted ?? level,
      disable: next.disable ?? before.disable,
      keep: next.keep ?? before.keep,
    };

    const verdict = await deps.gate({ connector, before, after });
    if (!verdict.ok) return { ok: false, why: verdict.why };

    // Merged into the entry that is there, so `source` and `writes` — which this page has no
    // business touching — survive a level change.
    const entry = { ...(section[connector] as object | undefined) } as Record<string, unknown>;
    assign(entry, "level", wanted);
    assign(entry, "disable", next.disable);
    assign(entry, "keep", next.keep);
    section[connector] = entry;
    doc.mcp = section;

    try {
      write(path, `${JSON.stringify(doc, null, 2)}\n`);
    } catch (err) {
      return { ok: false, why: `${path} could not be written: ${msg(err)}` };
    }
    return { ok: true, moved: deps.remask() };
  };
}

/** `undefined` leaves the key alone; `null` and an empty list REMOVE it, which is how a
 *  picker says "follow the default" without inventing a sentinel level. */
function assign(entry: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return;
  if (value === null || (Array.isArray(value) && value.length === 0)) delete entry[key];
  else entry[key] = value;
}

const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));
