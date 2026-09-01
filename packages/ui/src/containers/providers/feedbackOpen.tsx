import { createContext, useContext } from "react";
import type { FeedbackDraft } from "../../feedback/feedback";

/**
 * Opening « Votre avis » from anywhere a PROBLEM surfaces (a wrong redaction on a
 * message, a reply, a document…) — not just the rail button. `AppShell` provides the
 * opener ONLY when `host.avis` exists (there must be somewhere to send it); when
 * `openAvis` is undefined the affordances simply don't render, same contract as
 * `useLinkOpen`. The optional `prefill` seeds the draft (category/template — see
 * `avis/redactionProblemDraft`); it must NEVER carry conversation content.
 */
export interface FeedbackOpenApi {
  openFeedback?: (prefill?: FeedbackDraft) => void;
}

const FeedbackOpenContext = createContext<FeedbackOpenApi>({});

export const FeedbackOpenProvider = FeedbackOpenContext.Provider;

/** The « Votre avis » opener (absent ⇒ hide the report affordance). */
export function useFeedbackOpen(): FeedbackOpenApi {
  return useContext(FeedbackOpenContext);
}
