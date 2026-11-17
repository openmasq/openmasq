import type { ProviderId, SubscriptionAccount } from "./types.js";

/**
 * Setting a subscription CLI up from INSIDE the app — install it, then sign it in — so
 * someone who has never opened a terminal can use the subscription they already pay
 * for. Wire shapes shared by the desktop's main process (`subscription/install/`), its
 * preload and the interface (rule 9: one home).
 */
export type SubscriptionCli = SubscriptionAccount["cli"];

export interface SubscriptionCliStatus {
  cli: SubscriptionCli;
  /** The binary is on this machine — the picker's own probe, never a spawn. */
  installed: boolean;
  /** This build can download and install it here (claude, codex — never antigravity). */
  installable: boolean;
  /** Bytes the install would download — said before the click, never a surprise. */
  downloadBytes?: number;
  /** This build can run the CLI's own sign-in from the app (claude, codex). False for
   *  antigravity, which has no sign-in command: the row then says so instead of
   *  offering a button that can only answer « unsupported ». */
  connectable: boolean;
  /** `null` = not asked (binary absent) or the CLI did not answer — a normal state. */
  loggedIn: boolean | null;
  email?: string;
  plan?: string;
}

export type SubscriptionInstallProgress =
  | { cli: SubscriptionCli; phase: "download"; received: number; total: number }
  | { cli: SubscriptionCli; phase: "verify" | "install" | "done" };

/** Why a set-up step stopped — a CODE the interface translates, never a sentence. */
export type SubscriptionSetupError = "unsupported" | "network" | "checksum" | "install" | "login" | "busy";

export interface SubscriptionSetupResult {
  ok: boolean;
  error?: SubscriptionSetupError;
}

/**
 * What the CLI's own sign-in prints, relayed as it happens. `url` is the page to open;
 * claude then shows a code on that page to PASTE back (`submitSubscriptionLoginCode`),
 * codex prints the one-time `code` to TYPE on that page and waits on its own.
 */
export type SubscriptionLoginEvent =
  | { cli: SubscriptionCli; kind: "url"; url: string }
  | { cli: SubscriptionCli; kind: "code"; code: string }
  | { cli: SubscriptionCli; kind: "done"; ok: boolean; error?: SubscriptionSetupError };

/** The catalogue provider each subscription CLI serves — the ONE table both main's
 *  switchboard (`subscriptionCliFor`) and the interface's reconnect action read. */
export const SUBSCRIPTION_CLI_PROVIDER: Readonly<Record<SubscriptionCli, ProviderId>> = {
  claude: "claude-cli",
  codex: "codex-cli",
  antigravity: "antigravity-cli",
};

/** Provider → the CLI that serves it, or `null` (not a subscription CLI). */
export function subscriptionCliOfProvider(provider: string): SubscriptionCli | null {
  for (const cli of Object.keys(SUBSCRIPTION_CLI_PROVIDER) as SubscriptionCli[]) {
    if (SUBSCRIPTION_CLI_PROVIDER[cli] === provider) return cli;
  }
  return null;
}

/**
 * Can the app run this CLI's OWN sign-in (claude, codex)? antigravity has no sign-in
 * command: its account is connected from the tool itself. Main's `loginSupported`
 * (`subscription/install/login.ts`) answers from its argv table; `login.test.ts` pins
 * that both answers agree.
 */
export const SUBSCRIPTION_CLI_IN_APP_LOGIN: Readonly<Record<SubscriptionCli, boolean>> = {
  claude: true,
  codex: true,
  antigravity: false,
};

/**
 * The wire CODE of a turn refused because the CLI's OWN session is missing or expired.
 * Errors cross main → renderer as a message string (typed classes do not survive IPC),
 * so main leads the message with `CLI_AUTH:<cli>` and the interface reads it back here —
 * the same shape as the gateway's `CREDITS_EXHAUSTED`. What follows the code is the CLI's
 * raw text, for the debug log only: the bubble shows the catalogue's sentence.
 */
const CLI_AUTH_RE = /\bCLI_AUTH:(claude|codex|antigravity)\b/;

export function cliAuthWire(cli: SubscriptionCli, detail?: string): string {
  const raw = (detail ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  return raw ? `CLI_AUTH:${cli} · ${raw}` : `CLI_AUTH:${cli}`;
}

/** The CLI whose session expired, read from an error message — `null` for any other error. */
export function cliAuthOf(message: string): SubscriptionCli | null {
  const m = CLI_AUTH_RE.exec(message || "");
  return m ? (m[1] as SubscriptionCli) : null;
}

/**
 * The wire CODE of a subscription-CLI turn that failed for a reason the APP can name —
 * the prompt does not fit the command line, the binary cannot be launched, the opt-in is
 * off, the turn carries what the CLI cannot take. Same shape and same reason as
 * `CLI_AUTH`: a typed error does not survive IPC, and the bounded code is all analytics
 * may read (the message itself is reduced to a fingerprint by the relay). What follows
 * ` · ` is the sentence main already composed in the user's language, shown as-is.
 * Anything the CLI itself answers (a quota, a model off the plan) keeps its own text.
 */
export const CLI_FAILURE_CODES = [
  "prompt_too_long",
  "spawn_missing",
  "spawn_denied",
  "spawn_other",
  "not_enabled",
  "missing",
  "attachments",
  "empty",
  "exit",
] as const;
export type CliFailureCode = (typeof CLI_FAILURE_CODES)[number];

const CLI_FAIL_RE = /\bCLI_FAIL:(claude|codex|antigravity):([a-z_]+)(?: · )?/;

export function cliFailWire(cli: SubscriptionCli, code: CliFailureCode, text: string): string {
  return `CLI_FAIL:${cli}:${code} · ${text}`;
}

/** The named failure read back from an error message — `null` for any other error, and
 *  for a code this build does not know (never a free string into a bounded field). */
export function cliFailOf(message: string): { cli: SubscriptionCli; code: CliFailureCode; text: string } | null {
  const s = message || "";
  const m = CLI_FAIL_RE.exec(s);
  if (!m || !(CLI_FAILURE_CODES as readonly string[]).includes(m[2])) return null;
  return { cli: m[1] as SubscriptionCli, code: m[2] as CliFailureCode, text: s.slice(m.index + m[0].length).trim() };
}
