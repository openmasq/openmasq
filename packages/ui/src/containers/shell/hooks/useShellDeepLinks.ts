import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatStore } from "../../../state/store";
import { setMemoryFresh, useAppDispatch, useAppSelector, type Section } from "../../../state/redux";
import { useMcpConnectedIds } from "../../../hooks/useMcpConnectedIds";
import { featureAccess } from "../../../state/featureAccess";
import type { MemoryUiApi } from "../../../memory/memoryUi";
import { useT } from "../../../i18n";

/** A deep-link request: an id plus a nonce, so asking for the SAME id twice re-opens it. */
export type DeepLink = { id: string; n: number } | null;

/** A Settings deep-link also carries the connector it went there to connect. */
export type SettingsRequest = {
  id: string;
  n: number;
  connectorId?: string;
  returnToConvId?: string;
} | null;

export type ShellDeepLinks = {
  settingsTab: SettingsRequest;
  openComp: DeepLink;
  openMemCard: DeepLink;
  connectedIds: string[];
  openSettings: (tab?: string, connectorId?: string, returnToConvId?: string) => void;
  openSkillById: (id: string) => void;
  memoryUiApi: MemoryUiApi;
  /** Disarm the auto-return once it has fired (see `useReturnAfterConnect`). */
  clearReturnTo: () => void;
};

/**
 * Every "open THAT one thing over there" request the shell serves: a Settings tab, a
 * compétence's editor, a memory card. All share one shape — an id
 * plus a **nonce**, because the nonce is what re-opens the SAME target twice (a plain id
 * would be a no-op the second time), and the user stays free to navigate afterwards.
 */
export function useShellDeepLinks({
  chat,
  section,
  go,
}: {
  chat: ChatStore;
  section: Section;
  go: (s: Section) => void;
}): ShellDeepLinks {
  const t = useT();
  const dispatch = useAppDispatch();
  // Live set of connected connector ids — used to auto-return to a conversation once the
  // connector it sent the user to Réglages to connect actually connects.
  const connectedIds = useMcpConnectedIds();
  const [settingsTab, setSettingsTab] = useState<SettingsRequest>(null);
  const [openComp, setOpenComp] = useState<DeepLink>(null);
  const [openMemCard, setOpenMemCard] = useState<DeepLink>(null);

  const openSettings = (tab?: string, connectorId?: string, returnToConvId?: string) => {
    if (tab)
      setSettingsTab((prev) => ({
        id: tab,
        n: (prev?.n ?? 0) + 1,
        connectorId,
        // Only arm the auto-return for a connector that isn't already connected —
        // otherwise there's nothing to come back FROM (and it would bounce instantly).
        returnToConvId:
          returnToConvId && connectorId && !connectedIds.includes(connectorId)
            ? returnToConvId
            : undefined,
      }));
    go("settings");
  };
  const openSkillById = useCallback(
    (id: string) => {
      // Gate closed: `go` would fall back to conversations, and the editor would open
      // on top — a modal for a removed feature. Do nothing.
      if (!featureAccess("competences")) return;
      setOpenComp((p) => ({ id, n: (p?.n ?? 0) + 1 }));
      go("competences");
    },
    [go],
  );
  // The chat's window into the MÉMOIRE (message captions: deep-link, resolve ids to
  // entities, « Annuler »). Memoized so bubbles' caption leaves only re-render when the
  // memory store actually changes.
  const memoryUiApi = useMemo<MemoryUiApi>(
    () => ({
      // ⚠️ Gate closed: the « Mémoire utilisée » caption STAYS (that's the decision —
      // nothing should accumulate invisibly), but it no longer leads to a screen
      // that isn't mounted. `resolve` and `forget` carry on: seeing WHAT was used
      // and being able to forget it is exactly what keeps the feature honest
      // when its inventory is no longer reachable.
      open: (cardId) => {
        if (!featureAccess("memory")) return;
        if (cardId) setOpenMemCard((p) => ({ id: cardId, n: (p?.n ?? 0) + 1 }));
        go("memory");
      },
      resolve: (ids) =>
        ids.flatMap((id) => {
          if (id === "profile") return [{ id, label: t.lists.memory.profileNode }];
          const card = chat.memoryData.cards.find((c) => c.id === id);
          return card ? [{ id, label: card.entity }] : [];
        }),
      forget: (ids) => ids.forEach((id) => chat.removeMemoryCard(id)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.memoryData, go],
  );
  // Visiting the Mémoire clears its « nouveau » dot.
  const memoryFresh = useAppSelector((s) => s.ui.memoryFresh);
  useEffect(() => {
    if (section === "memory" && memoryFresh) dispatch(setMemoryFresh(false));
  }, [section, memoryFresh, dispatch]);

  const clearReturnTo = useCallback(
    () => setSettingsTab((p) => (p ? { ...p, returnToConvId: undefined } : p)),
    [],
  );

  return {
    settingsTab,
    openComp,
    openMemCard,
    connectedIds,
    openSettings,
    openSkillById,
    memoryUiApi,
    clearReturnTo,
  };
}
