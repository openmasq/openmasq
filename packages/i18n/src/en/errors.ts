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

  creditsUnverifiable: "We couldn't check your credits. Nothing left the machine — try again.",
  modelNotAllowed: (brand) =>
    `This model isn't available with your ${brand} account. Pick another one.`,
  upstreamUnavailable: (brand) =>
    `${brand} couldn't reach the provider. Try again, or switch model.`,
  providerCreditsNamed: (provider) =>
    `Your ${provider} account is out of credit. Top it up at ${provider}, or switch model.`,
  providerCredits: "Your account at the provider is out of credit. Top it up, or switch model.",
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
    "The model didn't answer. Often: too many connectors active — try disconnecting a few.",

  waitSeconds: (s) => `~${s}s`,
  waitMinutes: (m) => `~${m} min`,
  resetToday: (time) => `at ${time}`,
  resetTomorrow: (time) => `tomorrow at ${time}`,
  resetOnDate: (date, time) => `on ${date} at ${time}`,

  quotaResetsAt: (when) => ` It resets ${when}.`,
  quotaEmpty: (when) =>
    `Your request quota on this model is used up.${when} Switch model under the message to carry on.`,
  quotaLeft: (n, ofLimit, when) =>
    `You have ${n} request${n > 1 ? "s" : ""} left on this model${ofLimit}.${when} After that you will need to switch model or wait.`,
  quotaOfLimit: (limit) => ` (of ${limit})`,

  interruptedBeforeSend: "Interrupted before the model was called — nothing left the machine.",
  exportedFileLost: "the exported file could not be retrieved — try again",
  replyInterrupted: "The reply stopped part-way through. Try again, or switch model.",
  replyNeverStarted: "The model never started answering. Try again, or switch model.",
} satisfies Messages["errors"];
