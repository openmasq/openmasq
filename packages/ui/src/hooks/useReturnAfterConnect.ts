import { useEffect } from "react";
import type { Section } from "../state/redux";

/**
 * Pure decision: should we return to a conversation now? Returns the conversation id
 * to jump to, or `null`. Fires only when armed (`returnToConvId` + `connectorId`
 * present), the user is still on Settings, and that connector is now connected.
 */
export function shouldReturnAfterConnect(o: {
  connectorId?: string;
  returnToConvId?: string;
  connectedIds: string[];
  section: Section;
}): string | null {
  if (!o.returnToConvId || !o.connectorId) return null;
  if (o.section !== "settings") return null;
  if (!o.connectedIds.includes(o.connectorId)) return null;
  return o.returnToConvId;
}

/**
 * Auto-return to the conversation that sent the user off to Réglages to CONNECT a
 * connector. When the assistant proposes an integration, clicking « Connecter »
 * deep-links to Settings → MCP (armed via `openSettings(tab, connectorId, convId)`,
 * which stores `returnToConvId` on the deep-link). Once that connector reports
 * connected AND the user is still on Settings, we jump back to the triggering
 * conversation so they can resume where they left off — instead of stranding them in
 * Réglages.
 *
 * One-shot (the caller clears `returnToConvId` via `onDone`), and gated on
 * `section === "settings"`: a user who already navigated away on their own is NOT
 * yanked back. Fires only for the SPECIFIC armed connector, so connecting something
 * else in Settings meanwhile does nothing.
 */
export function useReturnAfterConnect(opts: {
  /** The connector the deep-link targeted (from the settings deep-link). */
  connectorId?: string;
  /** The conversation to return to once `connectorId` connects (armed = present). */
  returnToConvId?: string;
  /** Live set of currently-connected connector ids (`useMcpConnectedIds`). */
  connectedIds: string[];
  /** Current app section — the return only fires while still on Settings. */
  section: Section;
  /** Navigate back to the conversation (the shell's `selectConversation`). */
  onReturn: (convId: string) => void;
  /** Disarm — clear the stored `returnToConvId` so this fires exactly once. */
  onDone: () => void;
}): void {
  const { connectorId, returnToConvId, connectedIds, section, onReturn, onDone } = opts;
  useEffect(() => {
    const convId = shouldReturnAfterConnect({ connectorId, returnToConvId, connectedIds, section });
    if (!convId) return;
    onDone();
    onReturn(convId);
  }, [connectorId, returnToConvId, connectedIds, section, onReturn, onDone]);
}
