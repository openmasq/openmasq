import { createContext, useContext } from "react";

/**
 * The chat's window into the MÉMOIRE, for the message captions — a context for the
 * same reason as `competences/competenceOpen.tsx`: the consumers are leaves several
 * layers deep (`MessageBubble`), and the shell owns both the store and navigation.
 * `null` when no provider is mounted (a preview fragment, a test) — captions that
 * need resolution simply don't render.
 */
export interface MemoryUiApi {
  /** Navigate to the Mémoire page, optionally focused on one card. */
  open: (cardId?: string) => void;
  /** Resolve caption ids to display labels: card ids → the card's entity (dropped
   *  when the card no longer exists), the `"profile"` sentinel → « Profil ». */
  resolve: (ids: string[]) => { id: string; label: string }[];
  /** « Annuler » — remove the cards an explicit-ask extraction created. */
  forget: (ids: string[]) => void;
}

const MemoryUiCtx = createContext<MemoryUiApi | null>(null);

export const MemoryUiProvider = MemoryUiCtx.Provider;

export function useMemoryUi(): MemoryUiApi | null {
  return useContext(MemoryUiCtx);
}
