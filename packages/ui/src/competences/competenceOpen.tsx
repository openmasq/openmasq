import { createContext, useContext } from "react";

/**
 * Open a compétence for editing, from anywhere — a sent message's tag offers it, and
 * that bubble is a shared leaf several screens deep. Wired at the app root
 * (`containers/shell/AppShell.tsx`), which owns navigation.
 *
 * A CONTEXT rather than a threaded prop for the same reason as
 * `send/redaction.tsx`'s `useOpenMasqionSettings`: the only caller is a leaf far from
 * the shell, and drilling it would add a prop to every list/bubble layer in between.
 * The default is a NO-OP, so a bubble rendered outside the provider (a preview
 * fragment, a test) degrades to "no Éditer link" instead of throwing.
 */
const OpenCompetenceCtx = createContext<((id: string) => void) | null>(null);

export const CompetenceOpenProvider = OpenCompetenceCtx.Provider;

/** `null` when no provider is mounted — callers hide the affordance rather than
 *  render a link that does nothing. */
export function useOpenCompetence(): ((id: string) => void) | null {
  return useContext(OpenCompetenceCtx);
}
