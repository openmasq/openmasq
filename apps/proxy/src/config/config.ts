// The proxy's configuration, from its four sources in order of precedence:
//
//   flags  >  env  >  proxy.json (`clients.<tool>` over `run`)  >  the defaults
//
// Every source reads the SAME table (`options.ts`); this file only merges, remembers where
// each value came from (`config show` prints it), and checks what no single option can —
// the port, the origins, and the two `--reveal` refusals. No I/O except the two files
// (`proxy.json`, `--secrets-file`), both injected, so the tests build a config by hand.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { RedactionLevel } from "@openmasq/catalog";
import { type ConfigFile, readConfigFile, type Settings } from "./file.js";
import { byFlag, byName, fromString, OPTIONS, type Source } from "./options.js";
import { DEFAULTS, type ProxyConfig } from "./schema.js";
import { USAGE } from "./usage.js";

export { USAGE };
export type { RedactionLevel, Source };
export { DEFAULTS, LEVELS, type ProxyConfig, WRITE_POLICIES, type WritePolicy } from "./schema.js";
export { parseAlways } from "./options.js";

/** One secret per line; blank lines and `#` comments ignored. The file is never logged. */
export function readSecretsFile(
  path: string,
  read: (p: string) => string = (p) => readFileSync(p, "utf8"),
): string[] {
  return read(path)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export interface Io {
  /** The config file's text, or `undefined` when there is none at that path. */
  readConfig?: (path: string) => string | undefined;
  readSecrets?: (path: string) => string;
}

/** No file unless the caller hands one: the tests' default, so a developer's own
 *  `~/.openmasq/proxy.json` never leaks into an assertion. */
const NO_FILE: Io = { readConfig: () => undefined };

export interface Parsed {
  config: ProxyConfig;
  /** Where each option's value came from, by option NAME. */
  sources: Record<string, Source>;
  file?: ConfigFile;
}

/** The wrapped tool's name as `clients` keys it: `/opt/bin/claude.cmd` → `claude`. */
export const toolName = (command: string[]): string =>
  basename(command[0] ?? "")
    .replace(/\.(cmd|exe|bat)$/i, "")
    .toLowerCase();

/** `--port 8787 --level strict --mcp -- claude`, plus env and the file. */
export function parseConfig(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: Io = {},
): Parsed {
  const flags: Settings = {};
  let command: string[] = [];
  let configPath = env.OPENMASQ_PROXY_CONFIG ?? "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      command = argv.slice(i + 1);
      if (!command.length) throw new Error("-- needs a command to run");
      break;
    }
    if (a === "--help" || a === "-h") throw new Error(USAGE);
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--config") {
      configPath = next();
      continue;
    }
    const o = byFlag(a);
    if (!o) throw new Error(`Unknown flag ${a}\n\n${USAGE}`);
    if (o.kind === "boolean") flags[o.name] = o.flagSets;
    else {
      const v = fromString(o, next(), "flag");
      // `--always` accumulates: a second flag adds terms, it does not replace the first.
      flags[o.name] =
        o.kind === "always" && Array.isArray(flags[o.name])
          ? [...(flags[o.name] as unknown[]), ...(v as unknown[])]
          : v;
    }
  }

  const fromEnv: Settings = {};
  for (const o of OPTIONS)
    if (o.env && env[o.env] !== undefined)
      fromEnv[o.name] = fromString(o, env[o.env] as string, "env");

  const file = readConfigFile(configPath, io.readConfig);
  const config: ProxyConfig = { ...DEFAULTS, command };
  const sources: Record<string, Source> = Object.fromEntries(
    OPTIONS.map((o) => [o.name, "default"]),
  );
  const apply = (layer: Settings, source: Source) => {
    for (const [name, value] of Object.entries(layer)) {
      const o = byName(name);
      if (!o) continue;
      (config as unknown as Record<string, unknown>)[o.key] = value;
      sources[name] = source;
    }
  };
  if (file) {
    apply(file.run, "file");
    apply(file.clients[toolName(command)] ?? {}, "client");
  }
  apply(fromEnv, "env");
  apply(flags, "flag");

  // What one option implies for another.
  if (config.open) config.console = true; // `--open` opens the console page, so it asks for one
  if (config.mcpConfig) config.mcp = true;
  config.secrets = config.secretsFile ? readSecretsFile(config.secretsFile, io.readSecrets) : [];

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new Error(`Bad port ${config.port}`);
  for (const u of [config.openai, config.anthropic, config.gemini])
    if (!/^https?:\/\//.test(u)) throw new Error(`Upstream must be an http(s) origin: ${u}`);
  // --reveal puts real personal data on screen. It is allowed on an operator's terminal and
  // nowhere else: not in a machine-read stream, and not behind a tool that takes the terminal
  // (its lines would go to the log FILE, which is copied, backed up and grepped).
  if (config.reveal && config.json)
    throw new Error("--reveal cannot be used with --json: values must not enter a machine log.");
  // A wrapped tool owns the terminal, so the request lines go to the log FILE — where a
  // revealed value would be written down, copied and backed up. A same-terminal bar was tried
  // and removed: a scroll region does not change what the child believes the screen is (a
  // child under a 1..34 region of 40 rows still reports `40 100`), so a repainting tool paints
  // straight through it. The one screen that CAN show a value during a wrapped run is the
  // console page — loopback, a token per run — so `--console` lifts the refusal, and the
  // value then goes to that page ONLY: the file reporter is built without reveal
  // (`server.ts`, `revealFor`), whatever the flag says.
  if (config.reveal && config.command.length && !config.console)
    throw new Error(
      "--reveal cannot be used with `-- <tool>` alone: the tool owns the terminal, so the lines\n" +
        "would go to the log file. Add --console to see the values on the console page (the log\n" +
        "keeps counts only), or run the proxy in its own window with --reveal and start the tool\n" +
        "in another with the printed base URLs (press c to copy them).",
    );
  return { config, sources, ...(file ? { file } : {}) };
}

/** The config alone — and, unless `io` says otherwise, NO file read (see `NO_FILE`). */
export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: Io = NO_FILE,
): ProxyConfig {
  return parseConfig(argv, env, io).config;
}
