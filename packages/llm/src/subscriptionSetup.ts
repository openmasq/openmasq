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
