// The proxy's configuration: flags first, then `OPENMASQ_*` env, then the defaults. No I/O
// except `--secrets-file` (a read, injected in tests), so `server.ts` can print a usage and
// the tests can build a config by hand.
import { readFileSync } from "node:fs";

import type { RedactionLevel } from "@openmasq/catalog";
import type { ThemeChoice } from "../lib/ui/theme.js";
import { DEFAULTS, LEVELS, type ProxyConfig, WRITE_POLICIES, type WritePolicy } from "./schema.js";
import { USAGE } from "./usage.js";

export { USAGE };
export type { RedactionLevel };
export { DEFAULTS, LEVELS, type ProxyConfig, WRITE_POLICIES, type WritePolicy } from "./schema.js";
/** `Groupe Delorme:company,FR76…:iban` → forced redactions. A missing type is `name`. */
export function parseAlways(v: string): { value: string; category: string }[] {
  return list(v).map((entry) => {
    const at = entry.lastIndexOf(":");
    const value = at > 0 ? entry.slice(0, at).trim() : entry;
    const category = at > 0 ? entry.slice(at + 1).trim() : "name";
    if (!value) throw new Error(`--always: empty term in "${entry}"`);
    return { value, category };
  });
}

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

const themeChoice = (v: string | undefined): ThemeChoice | undefined =>
  v === "auto" || v === "light" || v === "dark" ? v : undefined;

const list = (v: string | undefined): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** `--port 8787 --openai https://… --ner <dir> --rules-only --mode token --keep A,B --quiet`. */
export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ProxyConfig {
  const c: ProxyConfig = {
    ...DEFAULTS,
    port: Number(env.OPENMASQ_PROXY_PORT ?? DEFAULTS.port),
    openai: env.OPENMASQ_UPSTREAM_OPENAI ?? DEFAULTS.openai,
    anthropic: env.OPENMASQ_UPSTREAM_ANTHROPIC ?? DEFAULTS.anthropic,
    gemini: env.OPENMASQ_UPSTREAM_GEMINI ?? DEFAULTS.gemini,
    nerDir: env.OPENMASQ_NER_DIR ?? "",
    mode: env.OPENMASQ_PROXY_MODE === "token" ? "token" : "fake",
    keep: list(env.OPENMASQ_PROXY_KEEP),
    disabledKinds: list(env.OPENMASQ_PROXY_DISABLED_KINDS),
    level: (LEVELS as readonly string[]).includes(env.OPENMASQ_PROXY_LEVEL ?? "")
      ? (env.OPENMASQ_PROXY_LEVEL as RedactionLevel)
      : DEFAULTS.level,
    always: parseAlways(env.OPENMASQ_PROXY_ALWAYS ?? ""),
    secrets: [],
    theme: themeChoice(env.OPENMASQ_PROXY_THEME) ?? DEFAULTS.theme,
    splash: env.OPENMASQ_PROXY_SPLASH !== "0",
    open: env.OPENMASQ_PROXY_OPEN === "1",
    mcpConfig: env.OPENMASQ_PROXY_MCP_CONFIG ?? "",
    mcp: !!env.OPENMASQ_PROXY_MCP_CONFIG,
    mcpWrites: (WRITE_POLICIES as readonly string[]).includes(env.OPENMASQ_PROXY_MCP_WRITES ?? "")
      ? (env.OPENMASQ_PROXY_MCP_WRITES as WritePolicy)
      : DEFAULTS.mcpWrites,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      c.command = argv.slice(i + 1);
      if (!c.command.length) throw new Error("-- needs a command to run");
      break;
    }
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--port":
        c.port = Number(next());
        break;
      case "--openai":
        c.openai = next();
        break;
      case "--anthropic":
        c.anthropic = next();
        break;
      case "--gemini":
        c.gemini = next();
        break;
      case "--ner":
        c.nerDir = next();
        break;
      case "--rules-only":
        c.rulesOnly = true;
        break;
      case "--mode": {
        const m = next();
        if (m !== "fake" && m !== "token") throw new Error(`--mode is fake or token, not ${m}`);
        c.mode = m;
        break;
      }
      case "--keep":
        c.keep = list(next());
        break;
      case "--disable":
        c.disabledKinds = list(next());
        break;
      case "--level": {
        const l = next();
        if (!(LEVELS as readonly string[]).includes(l))
          throw new Error(`--level is standard, renforce or strict, not ${l}`);
        c.level = l as RedactionLevel;
        break;
      }
      case "--always":
        c.always = c.always.concat(parseAlways(next()));
        break;
      case "--secrets-file":
        c.secrets = c.secrets.concat(readSecretsFile(next()));
        break;
      case "--quiet":
        c.verbose = false;
        break;
      case "--json":
        c.json = true;
        break;
      case "--reveal":
        c.reveal = true;
        break;
      case "--log":
        c.logFile = next();
        break;
      case "--mcp":
        c.mcp = true;
        break;
      case "--mcp-no-adopt":
        c.mcpAdopt = false;
        break;
      case "--console":
        c.console = true;
        break;
      case "--open":
        c.open = true;
        break;
      case "--no-splash":
        c.splash = false;
        break;
      case "--theme": {
        const t = themeChoice(next());
        if (!t) throw new Error("--theme is auto, light or dark");
        c.theme = t;
        break;
      }
      case "--mcp-config":
        c.mcpConfig = next();
        c.mcp = true;
        break;
      case "--mcp-writes": {
        const w = next();
        if (!(WRITE_POLICIES as readonly string[]).includes(w))
          throw new Error(`--mcp-writes is confirm, deny or allow, not ${w}`);
        c.mcpWrites = w as WritePolicy;
        break;
      }
      case "--help":
      case "-h":
        throw new Error(USAGE);
      default:
        throw new Error(`Unknown flag ${a}\n\n${USAGE}`);
    }
  }
  // `--open` opens the console page, so it asks for the console to exist.
  if (c.open) c.console = true;
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535)
    throw new Error(`Bad port ${c.port}`);
  for (const u of [c.openai, c.anthropic, c.gemini]) {
    if (!/^https?:\/\//.test(u)) throw new Error(`Upstream must be an http(s) origin: ${u}`);
  }
  // --reveal puts real personal data on screen. It is allowed on an operator's terminal and
  // nowhere else: not in a machine-read stream, and not behind a tool that takes the terminal
  // (its lines would go to the log FILE, which is copied, backed up and grepped).
  if (c.reveal && c.json)
    throw new Error("--reveal cannot be used with --json: values must not enter a machine log.");
  // A wrapped tool owns the terminal, so the request lines go to the log FILE — where a
  // revealed value would be written down, copied and backed up. A same-terminal bar was tried
  // and removed: a scroll region does not change what the child believes the screen is (a
  // child under a 1..34 region of 40 rows still reports `40 100`), so a repainting tool paints
  // straight through it. The one screen that CAN show a value during a wrapped run is the
  // console page — loopback, a token per run — so `--console` lifts the refusal, and the
  // value then goes to that page ONLY: the file reporter is built without reveal
  // (`server.ts`, `revealFor`), whatever the flag says.
  if (c.reveal && c.command.length && !c.console)
    throw new Error(
      "--reveal cannot be used with `-- <tool>` alone: the tool owns the terminal, so the lines\n" +
        "would go to the log file. Add --console to see the values on the console page (the log\n" +
        "keeps counts only), or run the proxy in its own window with --reveal and start the tool\n" +
        "in another with the printed base URLs (press c to copy them).",
    );
  return c;
}
