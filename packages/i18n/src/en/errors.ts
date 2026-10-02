/**
 * The EN catalogue's « errors » slice — translated from the source (`../fr/errors.ts`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/errors.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const errors = {
  theProvider: "at the provider",
  atProvider: (provider) => `at ${provider}`,

  creditsUnverifiable: "We couldn't check your credits. Nothing was sent. Try again.",
  modelNotAllowed: (brand) =>
    `This model isn't available with your ${brand} account. Pick another one.`,
  upstreamUnavailable: (brand) =>
    `${brand} couldn't reach the provider. Try again, or switch models.`,
  providerCreditsNamed: (provider) =>
    `Your ${provider} account is out of credits. Add credits at ${provider}, or switch models.`,
  providerCredits: "Your provider account is out of credits. Add credits, or switch models.",
  invalidKeyNamed: (provider) => `Your ${provider} key was refused. Check it, or enter a new one.`,
  invalidKey: "Your key was refused by the provider. Check it, or enter a new one.",
  rateBurst: (wait) => `Too many requests at once. Wait ${wait} and try again.`,
  someSeconds: "a few seconds",
  freeCap: (limit) => `${limit} free requests`,
  freeCapPlain: "free requests",
  dailyExhausted: (cap, when) => `Your ${cap} for today are used up.${when}`,
  quotaExhausted: (atProvider, when) => `Your quota ${atProvider} is used up for now.${when}`,
  resetsAt: (when) => ` It resets ${when}.`,
  modelStall:
    "The model didn't respond. This often happens with too many active connectors. Try disconnecting a few.",

  waitSeconds: (s) => `~${s}s`,
  waitMinutes: (m) => `~${m} min`,
  resetToday: (time) => `at ${time}`,
  resetTomorrow: (time) => `tomorrow at ${time}`,
  resetOnDate: (date, time) => `on ${date} at ${time}`,

  quotaResetsAt: (when) => ` It resets ${when}.`,
  quotaEmpty: (when) =>
    `Your request quota on this model is used up.${when} Switch models under the message to continue.`,
  quotaLeft: (n, ofLimit, when) =>
    `You have ${n} request${n > 1 ? "s" : ""} left on this model${ofLimit}.${when} After that, switch models or wait.`,
  quotaOfLimit: (limit) => ` (of ${limit})`,

  interruptedBeforeSend: "Interrupted before the model was called. Nothing was sent.",
  exportedFileLost: "the exported file couldn't be retrieved, try again",
  replyInterrupted: "The reply stopped partway through. Try again, or switch models.",
  replyNeverStarted: "The model never started answering. Try again, or switch models.",
} satisfies Messages["errors"];
