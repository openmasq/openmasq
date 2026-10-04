/**
 * The EN catalogue's « turnStatus » slice — translated from the source (`../fr/turnStatus.ts`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/turnStatus.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const turnStatus = {
  eyebrow: {
    sendBlocked: "Cannot send",
    quota: "Quota used up",
    keyRequired: "Key required",
    planRequired: "Subscription required",
    signedOut: "Session expired",
    interrupted: "Reply interrupted",
    empty: "Empty reply",
    tool: "Step failed",
    limit: "Limit reached",
  },
  retry: "Retry",
  fillKey: "Enter key",
  reconnect: "Sign in again",
  reconnectTitle: (cli) => `Sign in to ${cli}`,
  failedDefault: "The reply failed.",
  interrupted: "The reply stopped before the end.",
  empty: "The model returned nothing.",
  toolFlowFailed:
    "A tool step failed. Retrying runs all steps again, and each change asks for your confirmation again.",
  credits: {
    title: "Your free credits are used up",
    desc: (brand, keyName) =>
      `Subscribe to keep using the models ${brand} provides, or use your own ${keyName} key. It doesn't use your credits.`,
    resetOn: (date) => `Resets on ${date}`,
    useKey: (name) => `Use my ${name} key`,
    useKeyTip: (name) => `Enter your ${name} key`,
    used: (amount) => `${amount} used`,
    left: (amount) => `${amount} left`,
  },
} satisfies Messages["turnStatus"];
