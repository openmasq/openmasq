/**
 * The EN catalogue's « agent » slice — translated from the source (`../fr/agent.ts`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/agent.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const agent = {
  toolIntentSystem:
    "You summarise, in ONE short English sentence in the first person present " +
    '(e.g. "I\'m searching the latest news", "I\'m sending the email to the team"), ' +
    "what this tool call does — to show the user WHILE they wait. " +
    "Describe the INTENT readably, with no jargon and no technical tool name. " +
    "12 words maximum. No quotes, no final punctuation, no other output.",
} satisfies Messages["agent"];
