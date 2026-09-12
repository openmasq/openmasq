// `config init` and `config edit` — the two ways into `~/.openmasq/proxy.json` that do not
// start with "open your editor and remember the shape". `init` writes the empty file and the
// schema beside it (`$schema` is what gives the editor its completion); `edit` opens whatever
// `$VISUAL`/`$EDITOR` names, and CHECKS the file when the editor returns, the way the run
// would — a typo is caught here, not at the next start.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseMcpPolicy } from "../features/mcp/policy.js";
import { parseConfig } from "./config.js";
import { DEFAULT_CONFIG_FILE } from "./file.js";
import { onPath } from "../lib/wrap.js";
import { jsonSchema } from "./jsonSchema.js";

export const SCHEMA_FILE = "proxy.schema.json";

export interface Files {
  exists: (p: string) => boolean;
  /** The file's text, or `undefined` when there is none. */
  read: (p: string) => string | undefined;
  write: (p: string, text: string) => void;
  mkdir: (dir: string) => void;
}

/** Runs the editor; resolves to its exit status (`null` when it died on a signal). */
export type Spawn = (command: string, args: string[]) => number | null;

const DISK: Files = {
  exists: existsSync,
  read: (p) => (existsSync(p) ? readFileSync(p, "utf8") : undefined),
  write: (p, text) => writeFileSync(p, text),
  mkdir: (dir) => mkdirSync(dir, { recursive: true, mode: 0o700 }),
};

const run: Spawn = (command, args) => spawnSync(command, args, { stdio: "inherit" }).status;

interface Say {
  out: (text: string) => void;
  err: (text: string) => void;
}

/** The empty file: the three blocks and a `$schema` pointing beside it. No value is written
 *  — a default copied into the file would read as a choice in `config show`. */
export const skeleton = (schemaPath: string): string =>
  `${JSON.stringify({ $schema: `./${basename(schemaPath)}`, run: {}, clients: {}, mcp: {} }, null, 2)}\n`;

/**
 * Write the file and its schema. Refuses to overwrite an existing file: it is the user's
 * own policy, and `init` is not the command that loses it.
 */
export function initConfig(path: string, deps: Say & Partial<Files>): number {
  const files = { ...DISK, ...deps };
  const file = path || DEFAULT_CONFIG_FILE();
  const schemaPath = join(dirname(file), SCHEMA_FILE);
  if (files.exists(file)) {
    deps.err(`${file} already exists — edit it (openmasq-proxy config edit), or remove it first.`);
    return 1;
  }
  files.mkdir(dirname(file));
  files.write(schemaPath, `${JSON.stringify(jsonSchema(), null, 2)}\n`);
  files.write(file, skeleton(schemaPath));
  deps.out(`${file}: written, with ${SCHEMA_FILE} beside it for the editor's completion.`);
  deps.out(`  run      the flags by name — "level", "console", "mcpWrites", "disable"…`);
  deps.out(`  clients  overrides per wrapped tool — "hermes": { "open": true }`);
  deps.out(
    `  mcp      per server — "notion": { "source": "openmasq", "level": "strict", "writes": "deny" }`,
  );
  deps.out(`  next:    openmasq-proxy config edit`);
  return 0;
}

/** The editors tried when the user named none, in order. A desktop editor gets `--wait`,
 *  so the command returns when the tab is CLOSED — that return is when the file is checked.
 *  Then the terminal ones, friendliest first; `vi` last, because it is always there. */
export const EDITORS: readonly string[][] = [
  ["cursor", "--wait"],
  ["code", "--wait"],
  ["zed", "--wait"],
  ["subl", "--wait"],
  ["windsurf", "--wait"],
  ["nano"],
  ["vim"],
  ["vi"],
];

/** Which editor: `$VISUAL`, then `$EDITOR` (an editor with its own flags, `code --wait`, is
 *  split on whitespace), then the first of `EDITORS` on the PATH, then the platform's plain
 *  one — `notepad` on Windows, `vi` elsewhere. */
export function editorCommand(
  env: NodeJS.ProcessEnv,
  platform = process.platform,
  has: (command: string) => boolean = (c) => onPath(c, env),
): string[] {
  const named = (env.VISUAL || env.EDITOR || "").trim();
  if (named) return named.split(/\s+/);
  const found = EDITORS.find(([cmd]) => has(cmd));
  if (found) return [...found];
  return [platform === "win32" ? "notepad" : "vi"];
}

export function editConfig(
  path: string,
  deps: Say & Partial<Files> & { env: NodeJS.ProcessEnv; spawn?: Spawn },
): number {
  const files = { ...DISK, ...deps };
  const file = path || DEFAULT_CONFIG_FILE();
  if (!files.exists(file)) {
    const code = initConfig(path, { ...deps, ...files });
    if (code !== 0) return code;
  }
  const [cmd, ...args] = editorCommand(deps.env);
  deps.out(
    `opening ${file} in ${cmd}${args.length ? " (checked when the tab closes)" : ""} — set $VISUAL or $EDITOR to choose another.`,
  );
  const status = (deps.spawn ?? run)(cmd, [...args, file]);
  if (status !== 0) {
    deps.err(
      `${cmd} exited with ${status === null ? "a signal" : `status ${status}`} — the file was not checked.`,
    );
    return 1;
  }
  // The same reading the run does, on the file just saved: what refuses here refuses there.
  try {
    const parsed = parseConfig(["--config", file], deps.env, { readConfig: files.read });
    parseMcpPolicy(parsed.file?.mcp ?? {}, `${file} › mcp`);
  } catch (e) {
    deps.err(`${e instanceof Error ? e.message : String(e)}\n  fix it: openmasq-proxy config edit`);
    return 1;
  }
  deps.out(`${file}: valid — openmasq-proxy config show prints the run it gives.`);
  return 0;
}
