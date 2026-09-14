import type { SubscriptionAccount } from "./types.js";

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
