// `~/.openmasq/proxy.json` — the declarative half of the configuration. No secret lives in
// it (those are `mcp.json`'s, 0600), so it can be shared or versioned in a team.
//
//   {
//     "run":     { "level": "renforce", "console": true },   the same names as the flags
//     "clients": { "hermes": { "open": true } },              by wrapped tool, over `run`
//     "mcp":     { "notion": { "source": "openmasq", "level": "strict", "writes": "deny" } }
//   }
//
// A malformed file REFUSES the start — never "ignored, running with the defaults": a
// `"level": "strcit"` that ran at standard without a word would be a leak. Unknown keys are
// refused too, with the nearest name when there is one, because a policy that is silently
// not applied is worse than none.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openmasqDir } from "../lib/stateDir.js";
import { byName, closest, fromJson, OPTIONS } from "./options.js";

export const DEFAULT_CONFIG_FILE = (): string => join(openmasqDir(), "proxy.json");

/** Option values by option NAME, typed by `fromJson`. */
export type Settings = Record<string, unknown>;

export interface ConfigFile {
  path: string;
  run: Settings;
  clients: Record<string, Settings>;
  /** Per-server MCP policy, validated by `features/mcp/policy.ts` — it owns the shape. */
  mcp: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const TOP = ["$schema", "run", "clients", "mcp"];

/**
 * Read the file at `path`, or the default one when `path` is "". A default that is absent is
 * no file at all; a NAMED one that is absent is an error — the user asked for it.
 */
export function readConfigFile(
  path: string,
  read: (p: string) => string | undefined = (p) =>
    existsSync(p) ? readFileSync(p, "utf8") : undefined,
): ConfigFile | undefined {
  const named = !!path;
  const file = path || DEFAULT_CONFIG_FILE();
  const text = read(file);
  if (text === undefined) {
    if (named) throw new Error(`${file}: no such file`);
    return undefined;
  }
  return parseConfigFile(text, file);
}

export function parseConfigFile(text: string, path = "proxy.json"): ConfigFile {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path}: not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(doc)) throw new Error(`${path}: the file must be a JSON object`);
  for (const k of Object.keys(doc))
    if (!TOP.includes(k)) throw new Error(`${path}: unknown section "${k}"${hint(k, TOP)}`);
  const run = settings(doc.run, `${path} › run`);
  const clients: Record<string, Settings> = {};
  if (doc.clients !== undefined) {
    if (!isRecord(doc.clients))
      throw new Error(`${path} › clients must be an object, by tool name`);
    for (const [tool, raw] of Object.entries(doc.clients))
      clients[tool.toLowerCase()] = settings(raw, `${path} › clients.${tool}`);
  }
  if (doc.mcp !== undefined && !isRecord(doc.mcp))
    throw new Error(`${path} › mcp must be an object, by server id`);
  return { path, run, clients, mcp: (doc.mcp as Record<string, unknown>) ?? {} };
}

/** One settings block (`run`, or one client), every key an option the file may set. */
function settings(raw: unknown, where: string): Settings {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw new Error(`${where} must be an object`);
  const out: Settings = {};
  for (const [name, value] of Object.entries(raw)) {
    const o = byName(name);
    if (!o) throw new Error(`${where}: unknown option "${name}"${hint(name, fileNames())}`);
    if (!o.file)
      throw new Error(
        `${where}: "${name}" is a per-run flag (${o.flag}), not a setting the file may hold`,
      );
    out[name] = fromJson(o, value, where);
  }
  return out;
}

const fileNames = (): string[] => OPTIONS.filter((o) => o.file).map((o) => o.name);

const hint = (name: string, among: readonly string[]): string => {
  const near = closest(name, among);
  return near ? ` — did you mean "${near}"?` : "";
};
