// The proxy's configuration: flags first, then `OPENMASQ_*` env, then the defaults. No I/O
// except `--secrets-file` (a read, injected in tests), so `server.ts` can print a usage and
// the tests can build a config by hand.
import { readFileSync } from "node:fs";

import type { RedactionLevel } from "@openmasq/catalog";
export type { RedactionLevel };
export const LEVELS: readonly RedactionLevel[] = ["standard", "renforce", "strict"];

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

export interface ProxyConfig {
  /** Bind address — loopback ONLY. The proxy holds the vault and forwards the caller's
   *  key: exposing it on a network interface would hand both to the network. */
  host: string;
  port: number;
  /** Upstream origins, by wire family. */
  openai: string;
  anthropic: string;
  gemini: string;
  /** Bundled NER models dir (the desktop's `build/ner-models` layout). "" ⇒ none. */
  nerDir: string;
  /** Run on the pattern rules alone — an EXPLICIT opt-out of the fail-closed default: names,
   *  organisations and places are then NOT detected in free text (the desktop never allows it). */
  rulesOnly: boolean;
  /** What the model sees in place of a value: a believable fake, or an opaque token. */
  mode: "fake" | "token";
  /** Exact values never masked (a product name the model must route on). */
  keep: string[];
  /** Highlight kinds left in clear (e.g. `email`) — added to what `level` leaves in clear. */
  disabledKinds: string[];
  /** Which categories are on. `standard` is pattern rules only: fast, and no model to load.
   *  `renforce` (the desktop app's default) and `strict` add the on-device model's categories. */
  level: RedactionLevel;
  /** Terms ALWAYS masked, whatever the detectors find — the app's Vault. `value:type`. */
  always: { value: string; category: string }[];
  /** Exact strings always erased (keys, tokens), read from a file, one per line. */
  secrets: string[];
  /** How long a `x-openmasq-session` vault outlives its last request, in ms. */
  sessionTtlMs: number;
  /** Print one line per request (counts per category, never a value). */
  verbose: boolean;
  /** One JSON object per request on stdout instead of the pretty lines. */
  json: boolean;
  /** Print, on THIS terminal only, the real value behind each substitute. Opt-in: it puts
   *  personal data on screen, so it is refused wherever the output is kept or machine-read. */
  reveal: boolean;
  /** Everything after `--`: a tool to run with its base URLs pointed at the proxy. */
  command: string[];
  /** Where the request lines go while a wrapped tool owns the terminal ("" ⇒ ~/.openmasq/proxy.log). */
  logFile: string;
}

export const DEFAULTS: ProxyConfig = {
  host: "127.0.0.1",
  port: 8787,
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  nerDir: "",
  rulesOnly: false,
  mode: "fake",
  keep: [],
  disabledKinds: [],
  level: "standard",
  always: [],
  secrets: [],
  sessionTtlMs: 60 * 60 * 1000,
  verbose: true,
  json: false,
  reveal: false,
  command: [],
  logFile: "",
};

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
      case "--help":
      case "-h":
        throw new Error(USAGE);
      default:
        throw new Error(`Unknown flag ${a}\n\n${USAGE}`);
    }
  }
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
  if (c.reveal && c.command.length)
    throw new Error(
      "--reveal cannot be used with `-- <tool>`: the tool owns the terminal, so the lines would\n" +
        "go to the log file. Run the proxy in its own window with --reveal, and start the tool in\n" +
        "another with the printed base URLs (press c to copy them).",
    );
  return c;
}

export const USAGE = `openmasq-proxy — mask personal data before it leaves the machine

  openmasq-proxy [--port 8787] [--ner <models dir>] [--mode fake|token]
                 [--openai <origin>] [--anthropic <origin>] [--gemini <origin>]
                 [--level standard|renforce|strict] [--disable email,phone] [--keep A,B]
                 (standard is the default: deterministic pattern rules, no model loaded)
                 [--always "Groupe Delorme:company,FR76 3000…:iban"] [--secrets-file <path>]
                 [--rules-only] [--quiet] [--json] [--log <file>] [--reveal]
  openmasq-proxy [flags] -- claude            run a tool through the proxy, stop with it

Point any OpenAI- or Anthropic-compatible client at http://127.0.0.1:8787 and keep your
own API key: the proxy forwards it untouched, masks the messages on the way out and
restores the reply on the way back. Routes: /v1/chat/completions, /v1/responses,
/v1/embeddings (OpenAI), /v1/messages (Anthropic), /v1beta/models/<m>:generateContent and
:streamGenerateContent?alt=sse (Gemini); prefix with /openai, /anthropic or /gemini to force
a family. Headers: x-openmasq-session (reuse one vault across turns),
x-openmasq-mode (fake|token). Env: OPENMASQ_PROXY_PORT, OPENMASQ_UPSTREAM_OPENAI,
OPENMASQ_UPSTREAM_ANTHROPIC, OPENMASQ_UPSTREAM_GEMINI, OPENMASQ_NER_DIR, OPENMASQ_PROXY_MODE, OPENMASQ_PROXY_LEVEL,
OPENMASQ_PROXY_KEEP, OPENMASQ_PROXY_DISABLED_KINDS, OPENMASQ_PROXY_ALWAYS.
Types for --always: name, username, email, phone, company, address, city, id, card, iban, ip, path, dob, secret.`;
