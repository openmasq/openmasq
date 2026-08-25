import { createContext, useContext } from "react";
import type { FeedbackDraft } from "../../avis/avis";

/**
 * Opening « Votre avis » from anywhere a PROBLEM surfaces (a wrong redaction on a
 * message, a reply, a document…) — not just the rail button. `AppShell` provides the
 * opener ONLY when `host.avis` exists (there must be somewhere to send it); when
 * `openAvis` is undefined the affordances simply don't render, same contract as
 * `useLinkOpen`. The optional `prefill` seeds the draft (category/template — see
 * `avis/redactionProblemDraft`); it must NEVER carry conversation content.
 */
export interface AvisOpenApi {
  openAvis?: (prefill?: FeedbackDraft) => void;
}

const AvisOpenContext = createContext<AvisOpenApi>({});

export const AvisOpenProvider = AvisOpenContext.Provider;

/** The « Votre avis » opener (absent ⇒ hide the report affordance). */
export function useAvisOpen(): AvisOpenApi {
  return useContext(AvisOpenContext);
}
