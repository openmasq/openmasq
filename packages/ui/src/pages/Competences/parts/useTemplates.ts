import { useMemo } from "react";
import { BROWSER_CONNECTOR_ID } from "@openmasq/catalog/mcp";
import { useHost } from "../../../host";
import { offeredTemplates, type AnyTemplate } from "../../../suggestions";
import { useConnectedConnectors } from "./useConnectedConnectors";
import type { Competence } from "../../../types";
import { useT } from "../../../i18n";

/**
 * The STARTING TEMPLATES the page passes to its modal, and the "connected" marker the
 * connector picker displays — ONE single computation for both, otherwise the "what's
 * plugged in first" ranking and the green dots could contradict each other on screen.
 *
 * Pulled out of `CompetencesView` when the page absorbed the routines: it was passing
 * the 300-line cap (rule 1), and this is the most self-contained block — it depends only
 * on the existing list and the host.
 */
export function useTemplates(competences: readonly Competence[]): {
  suggestions: AnyTemplate[];
  connected: Set<string>;
} {
  const t = useT();
  const host = useHost();
  const connected = useConnectedConnectors();
  // The built-in browser activates on the HOST side, and this path is absent on some
  // platforms (mobile, web aperçu) — the same barrier as the browser card in
  // Réglages. A template naming it would go there to do nothing, silently.
  const unavailable = useMemo(
    () => new Set(host.mcp?.enableBrowser ? [] : [BROWSER_CONNECTOR_ID]),
    [host],
  );
  // ALL of them, not the strip's six: the modal shows them in a scrolling column with
  // category chips, and a chip filtering an already-truncated list would come up
  // empty for the categories the cap had excluded. Ones the person has already
  // written (by name) are removed, so the list shrinks as theirs grows.
  const suggestions = useMemo(
    () => offeredTemplates(competences, t, { limit: 99, connected, unavailable }),
    [competences, t, connected, unavailable],
  );
  return { suggestions, connected };
}
