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
    interrupted: "Reply interrupted",
    empty: "Empty reply",
    tool: "Step failed",
    limit: "Limit reached",
  },
  retry: "Retry",
  fillKey: "Enter the key",
  failedDefault: "The reply failed.",
  interrupted: "The reply was cut off before the end.",
  empty: "The model returned nothing.",
  toolFlowFailed:
    "A step of the tool flow failed. Retrying restarts the flow (successful steps are replayed; every write asks for confirmation again).",
  credits: {
    title: "Your free credits are used up",
    desc: (brand, keyName) =>
      `Take a subscription to keep using the models ${brand} provides, or send with your own ${keyName} key — it never touches your credits.`,
    resetOn: (date) => `Resets on ${date}`,
    useKey: (name) => `Use my ${name} key`,
    useKeyTip: (name) => `Enter your ${name} key`,
    used: (amount) => `${amount} used`,
    left: (amount) => `${amount} left`,
  },
} satisfies Messages["turnStatus"];
