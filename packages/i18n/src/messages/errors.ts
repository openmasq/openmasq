/**
 * The SEND ERRORS, as a user reads them.
 *
 * ⚠️ Each entry names ONE cause and ONE gesture. The first question in front of a failed
 * send is « did anything leave? » — which is why « rien n'est parti »
 * is spelled out where it is true, and nowhere else. A translation that
 * adds it for symmetry lies about the product; one that removes it leaves the question open.
 *
 * ⚠️ What is NOT here: the prose meant for the MODEL (`send/inboundScreen.ts`, the
 * classifier's instructions), which follows the CONVERSATION's language and not the
 * interface's — the same exclusion as `agent/` and `prompt/` in the `check:i18n` ratchet.
 * Nor the debug log's labels, which are technical by destination.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface ErrorsMessages {
  /** The provider, when the caller could not name it. */
  theProvider: string;
  atProvider: (provider: string) => string;

  creditsUnverifiable: string;
  modelNotAllowed: (brand: string) => string;
  upstreamUnavailable: (brand: string) => string;
  providerCreditsNamed: (provider: string) => string;
  providerCredits: string;
  invalidKeyNamed: (provider: string) => string;
  invalidKey: string;
  /** Burst: a short wait, announced when the gateway gives it. */
  rateBurst: (wait: string) => string;
  someSeconds: string;
  /** Daily quota exhausted. `freeCap` is said only when the body asserts it is free. */
  freeCap: (limit: string) => string;
  freeCapPlain: string;
  dailyExhausted: (cap: string, when: string) => string;
  quotaExhausted: (atProvider: string, when: string) => string;
  resetsAt: (when: string) => string;
  modelStall: string;

  /** The waits and the retries, in the units one reads at a glance. */
  waitSeconds: (seconds: number) => string;
  waitMinutes: (minutes: number) => string;
  resetToday: (time: string) => string;
  resetTomorrow: (time: string) => string;
  resetOnDate: (date: string, time: string) => string;

  /** The REMAINING quota, announced while there is still room to act. Zero is its own
   *  sentence: « il reste 0 » reads as a countdown, not as the wall one hits. */
  quotaResetsAt: (when: string) => string;
  quotaEmpty: (when: string) => string;
  quotaLeft: (remaining: number, ofLimit: string, when: string) => string;
  quotaOfLimit: (limit: number) => string;

  /** Three outcomes of a send, said to the user — not to the log. */
  interruptedBeforeSend: string;
  exportedFileLost: string;
  replyInterrupted: string;
  replyNeverStarted: string;
}
