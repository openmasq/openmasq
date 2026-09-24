// The proxy's configuration as a SHAPE: the levels, the write policies, every field with the
// sentence that says what it is for, and the defaults. Pure data — the parsing that fills it
// from flags and env is `config.ts`, which re-exports all of this so a consumer still has one
// import (`./config/config.js`).
import type { RedactionLevel } from "@openmasq/catalog";
import type { ThemeChoice } from "../lib/ui/theme.js";

export const LEVELS: readonly RedactionLevel[] = ["standard", "renforce", "strict"];

/** What happens to a MUTATING MCP tool call. Hiding the credential stops the secret from
 *  leaking; it does nothing about the authority the secret grants, so a write stops here.
 *  `confirm` is the default, and the card always says which one is on. */
export type WritePolicy = "confirm" | "deny" | "allow";
export const WRITE_POLICIES: readonly WritePolicy[] = ["confirm", "deny", "allow"];

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
  /** The file the `secrets` are read from ("" ⇒ none), one per line. */
  secretsFile: string;
  /** Exact strings always erased (keys, tokens) — DERIVED from `secretsFile`, never set. */
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
  /** Serve `/mcp`: the proxy connects to the declared MCP servers and re-exposes their tools
   *  with the values masked. The credentials stay here; the agent never receives one. */
  mcp: boolean;
  /** The servers file ("" ⇒ ~/.openmasq/mcp.json). It holds the credentials, so it is read
   *  once, at startup, and refused when other users can read it. */
  mcpConfig: string;
  /** What a mutating tool call gets: a confirmation on this terminal, a refusal, or a pass. */
  mcpWrites: WritePolicy;
  /** Wrapping a client with `--mcp`: take over the MCP servers IT declares, so making our
   *  endpoint its only one does not cost it the integrations it already had. */
  mcpAdopt: boolean;
  /** Play the opening sequence (one second, alternate screen). Off for a machine
   *  (`--json`, `--quiet`, a pipe, CI) whatever this says. */
  splash: boolean;
  /** Which ground the terminal paints on (`lib/ui/palette.ts`). `auto` asks the terminal
   *  (`COLORFGBG`) and falls back to dark. */
  theme: ThemeChoice;
  /** Open the live console in the system browser as soon as it is served. Implies `console`. */
  open: boolean;
  /** Serve the live console at /console. A token is minted per run and printed on the card;
   *  loopback alone is not an access control (`features/console/routes.ts` says why). */
  console: boolean;
  /** The console page carries the real value beside each substitute — ON by default (the
   *  operator's own screen, loopback, a token per run). `--no-console-reveal` sends
   *  substitutes only. The TERMINAL's `reveal` stays opt-in: a scrollback is kept and logged. */
  consoleReveal: boolean;
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
  secretsFile: "",
  secrets: [],
  sessionTtlMs: 60 * 60 * 1000,
  verbose: true,
  json: false,
  reveal: false,
  command: [],
  logFile: "",
  mcp: false,
  mcpConfig: "",
  mcpWrites: "confirm",
  mcpAdopt: true,
  console: false,
  consoleReveal: true,
  open: false,
  theme: "auto",
  splash: true,
};
