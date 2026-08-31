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
  openCompetenceById: (id: string) => void;
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
  const openCompetenceById = useCallback(
    (id: string) => {
      // Porte fermée : `go` retomberait sur les conversations, et l'éditeur s'ouvrirait
      // par-dessus — une modale d'une fonctionnalité retirée. On ne fait rien.
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
      // ⚠️ Porte fermée : la légende « Mémoire utilisée » RESTE (c'est la décision —
      // rien ne doit s'accumuler invisiblement), mais elle ne mène plus à un écran
      // qui n'est pas monté. `resolve` et `forget` continuent : voir CE qui a servi
      // et pouvoir l'oublier est justement ce qui garde la fonctionnalité honnête
      // quand son inventaire n'est plus atteignable.
      open: (cardId) => {
        if (!featureAccess("memory")) return;
        if (cardId) setOpenMemCard((p) => ({ id: cardId, n: (p?.n ?? 0) + 1 }));
        go("memory");
      },
      resolve: (ids) =>
        ids.flatMap((id) => {
          if (id === "profile") return [{ id, label: t.lists.memory.profileNode }];
          const card = chat.memoire.cards.find((c) => c.id === id);
          return card ? [{ id, label: card.entity }] : [];
        }),
      forget: (ids) => ids.forEach((id) => chat.removeMemoryCard(id)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.memoire, go],
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
    openCompetenceById,
    memoryUiApi,
    clearReturnTo,
  };
}
