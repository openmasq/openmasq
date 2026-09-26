// What Mistral Vibe will load, read from its OWN files. Vibe resolves its configuration in
// layers (schema defaults < user TOML < project TOML < `VIBE_*` variables < agent profile <
// org-enforced admin config), and a list such as `providers` or `mcp_servers` is merged BY
// NAME, a higher layer replacing the whole entry. So what the proxy hands it through
// `VIBE_*` must name every entry it means to override — hence reading them all here.
//
// Read as a SUPERSET: every `.vibe/config.toml` from the filesystem root down to the working
// directory, trusted or not. An entry Vibe would not have loaded costs nothing when we repoint
// or disable it; one we missed would leave the machine in clear. A file that does not PARSE
// is an error, never an empty config: an unread provider is an unmasked one.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse } from "smol-toml";

export type Doc = Record<string, unknown>;
export interface VibeFile {
  path: string;
  doc: Doc;
}
export interface VibeFiles {
  /** Lowest precedence first: the user file, then the project files outermost to innermost,
   *  then a `VIBE_*` JSON the user already exported (it outranks both). */
  configs: VibeFile[];
  /** Agent profiles: they outrank the variables we set, so they are inspected, not merged. */
  agents: VibeFile[];
}

export interface ReadDeps {
  exists?: (p: string) => boolean;
  read?: (p: string) => string;
  list?: (dir: string) => string[];
}

export function vibeHome(env: NodeJS.ProcessEnv, home = homedir()): string {
  const set = env.VIBE_HOME;
  if (!set) return join(home, ".vibe");
  return resolve(set.startsWith("~") ? join(home, set.slice(1)) : set);
}

/** `cwd` and every parent, outermost first. */
function ancestors(cwd: string): string[] {
  const out: string[] = [];
  for (let d = resolve(cwd); ; d = dirname(d)) {
    out.unshift(d);
    if (dirname(d) === d) return out;
  }
}

/** The list-valued `VIBE_*` variables the proxy may also set: the user's own value is a layer
 *  like any other, merged under ours rather than silently replaced. */
export const LIST_VARS = {
  providers: "VIBE_PROVIDERS",
  tts_providers: "VIBE_TTS_PROVIDERS",
  transcribe_providers: "VIBE_TRANSCRIBE_PROVIDERS",
  mcp_servers: "VIBE_MCP_SERVERS",
} as const;

/** Every variable the proxy sets for Vibe (`routing.ts`, `mcp/clients/vibe.ts`). */
export const OUR_VARS = [
  ...Object.values(LIST_VARS),
  "VIBE_ENABLE_TELEMETRY",
  "VIBE_VIBE_CODE_SESSIONS_BASE_URL",
  "VIBE_ENABLE_CONNECTORS",
  "VIBE_DISABLED_TOOLS",
];

export interface ReadScope {
  /** Where Vibe will run: its `--workdir`, else the current directory. */
  cwd: string;
  /** Its `--add-dir` roots: their `.vibe/` is read at their root only, like Vibe does. */
  addDirs?: string[];
}

/**
 * Vibe reads `VIBE_*` case-INSENSITIVELY, and its `~/.vibe/.env` fills whatever is unset. A
 * `vibe_providers` beside our `VIBE_PROVIDERS` is a second value for the same key, and which
 * one wins is not ours to decide: refused. The exact spelling is fine — ours is set, `.env`
 * then leaves it alone, and a list the user exported is merged under ours.
 */
function variantsOfOurs(env: NodeJS.ProcessEnv, dotenv: string): string[] {
  const ours = new Set(OUR_VARS);
  const upper = new Set(OUR_VARS.map((v) => v.toUpperCase()));
  const keys = [
    ...Object.keys(env),
    ...dotenv
      .split(/\r?\n/)
      .map((l) => /^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=/.exec(l)?.[1] ?? ""),
  ];
  return [...new Set(keys.filter((k) => k && upper.has(k.toUpperCase()) && !ours.has(k)))];
}

export function readVibeFiles(
  scope: string | ReadScope,
  env: NodeJS.ProcessEnv,
  deps: ReadDeps = {},
  home = homedir(),
): VibeFiles {
  const { cwd, addDirs = [] } = typeof scope === "string" ? { cwd: scope } : scope;
  const exists = deps.exists ?? existsSync;
  const read = deps.read ?? ((p: string) => readFileSync(p, "utf8"));
  const list = deps.list ?? ((d: string) => readdirSync(d));
  const load = (path: string): VibeFile => {
    try {
      return { path, doc: parse(read(path)) as Doc };
    } catch (err) {
      // Position only: the parser's message quotes the offending LINE, which may be a header
      // carrying a token — and this message is printed.
      const at = err as { line?: number; column?: number };
      const where = at.line ? ` at line ${at.line}, column ${at.column}` : "";
      throw new Error(`${path} is not valid TOML${where}`);
    }
  };
  const vhome = vibeHome(env, home);
  const dotenvPath = join(vhome, ".env");
  const clash = variantsOfOurs(env, exists(dotenvPath) ? read(dotenvPath) : "");
  if (clash.length)
    throw new Error(
      `${clash.join(", ")} is set in another case (Vibe reads these names case-insensitively), ` +
        "so it would compete with the proxy's own — remove it for this run",
    );
  const roots = [...ancestors(cwd), ...addDirs.map((d) => resolve(cwd, d))];
  const configPaths = [
    join(vhome, "config.toml"),
    ...roots.map((d) => join(d, ".vibe", "config.toml")),
  ];
  const configs = [...new Set(configPaths)].filter(exists).map(load);

  const envDoc: Doc = {};
  for (const [key, name] of Object.entries(LIST_VARS)) {
    const raw = env[name];
    if (!raw) continue;
    try {
      envDoc[key] = JSON.parse(raw);
    } catch {
      throw new Error(`${name} is set but is not JSON — Vibe would reject it too`);
    }
  }
  if (Object.keys(envDoc).length) configs.push({ path: "environment", doc: envDoc });

  // Agent profiles: the user's, every project root's, and whatever `agent_paths` adds.
  const extra: string[] = [];
  for (const f of configs)
    if (Array.isArray(f.doc.agent_paths)) extra.push(...f.doc.agent_paths.map(String));
  if (env.VIBE_AGENT_PATHS) {
    try {
      const v: unknown = JSON.parse(env.VIBE_AGENT_PATHS);
      if (!Array.isArray(v)) throw new Error();
      extra.push(...v.map(String));
    } catch {
      throw new Error("VIBE_AGENT_PATHS is set but is not a JSON list");
    }
  }
  const agentDirs = [
    join(vhome, "agents"),
    ...roots.map((d) => join(d, ".vibe", "agents")),
    ...extra.map((d) => resolve(cwd, d.startsWith("~") ? join(home, d.slice(1)) : d)),
  ];
  const agents: VibeFile[] = [];
  for (const dir of new Set(agentDirs)) {
    if (!exists(dir)) continue;
    for (const name of list(dir).filter((n) => n.endsWith(".toml")))
      agents.push(load(join(dir, name)));
  }
  return { configs, agents };
}

/** The user's own `VIBE_DISABLED_TOOLS`: Vibe CONCATENATES that list across layers, so what
 *  the proxy adds goes after it, never in its place. */
export function userDisabledTools(env: NodeJS.ProcessEnv): string[] {
  const raw = env.VIBE_DISABLED_TOOLS;
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("VIBE_DISABLED_TOOLS is not a JSON list");
  return parsed.map(String);
}

const isDoc = (v: unknown): v is Doc => !!v && typeof v === "object" && !Array.isArray(v);

/** A named list as Vibe merges it: by `name`, a later layer replacing the whole entry. */
export function mergedByName(files: VibeFile[], key: string, defaults: Doc[] = []): Doc[] {
  const byName = new Map<string, Doc>();
  for (const d of defaults) byName.set(String(d.name), d);
  for (const f of files) {
    const items = f.doc[key];
    if (!Array.isArray(items)) continue;
    for (const it of items) if (isDoc(it) && typeof it.name === "string") byName.set(it.name, it);
  }
  return [...byName.values()];
}
