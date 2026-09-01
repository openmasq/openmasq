import type { Messages } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";
// The Environnement card's (Réglages → Versions) pure logic: who to offer the
// switch to, and what sentence to put on a refusal. Separated from presentation (the
// logic-in-.ts rule) and tested — it's a DISPLAY gate only, the real guard
// lives again in the privileged process on every request.

export type RuntimeEnv = "production" | "staging" | "custom";

/** The button's target: from production, staging; from EVERYTHING else (staging, the
 *  self-hosted stack), production — returning to the default environment. */
export const otherEnv = (env: RuntimeEnv): RuntimeEnv =>
  env === "production" ? "staging" : "production";

/**
 * Offer the switch?
 *
 * - From STAGING or the SELF-HOSTED stack: always — the RETURN to production is
 *   allowed to everyone on the main side (going back to the default environment isn't a
 *   privilege), and hiding the button would turn a switched app into a dead end.
 * - From production: on the account's `staging_tester` flag (read fail-closed) or on
 *   machine privilege (`crossEnv`, the same one that shows both version streams).
 */
export function envSwitchOffered(p: {
  env: RuntimeEnv;
  stagingTester: boolean;
  crossEnv: boolean;
}): boolean {
  return p.env !== "production" || p.stagingTester || p.crossEnv;
}

/** The main process's refusal vocabulary → an honest sentence for the user. */
export function switchRefusalText(reason: string | undefined, t: Messages): string {
  switch (reason) {
    case "not_privileged":
      // ⚠️ "beta access" was WRONG here: this flag opens the test ENVIRONMENT (which
      // API the app talks to), not the beta channel (which builds it receives). The two
      // are independent since the single artifact — `main/ipc/registerEnvIpc.ts`.
      return t.versionsTab.refusal.notPrivileged(BRAND.name);
    case "write_failed":
      return t.versionsTab.refusal.writeFailed;
    default:
      return t.versionsTab.refusal.generic;
  }
}
