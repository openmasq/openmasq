import { useEffect, useRef } from "react";
import type { ChatStore } from "../state/store";
import { openTab, setOpenTabs, type AppDispatch } from "../state/redux";
import { activeConvId, type WorkspaceLayout } from "../workspace/layout";
import { shouldSeedActiveTab } from "./workspaceSeed";

/**
 * Keeps the workspace LAYOUT (the single source of truth for focus) and the store's
 * conversation state consistent — the three coupled AppShell effects, extracted:
 *  1. PRUNE open tabs whose conversation was deleted + seed the active one (backstop);
 *  2. MIRROR the focused pane's active conversation into the store's `activeId`
 *     (one-directional layout → activeId, no oscillation).
 *
 * ⚠️ The seed in (1) must never REOPEN a tab the user closed. `activeId` lags the layout by
 * one render, so a just-closed active tab is indistinguishable from an externally-set
 * activeId unless you look at history — `shouldSeedActiveTab` owns that rule (and is where
 * the reasoning lives). Because (2) is the ONLY writer of `activeId`, a caller must not
 * "help" by clearing it on close: that makes the layout stop being the single source of
 * truth for focus, which is the invariant this hook exists to hold.
 */
export function useWorkspaceSync(
  chat: ChatStore,
  layout: WorkspaceLayout,
  openTabIds: string[],
  dispatch: AppDispatch,
): void {
  // `openTabIds` as of this effect's LAST run — the only way to tell an activeId that was
  // set from outside (seed it) from one whose tab we just closed (leave it closed). See
  // `shouldSeedActiveTab`.
  const prevOpenTabIds = useRef<string[]>(openTabIds);

  useEffect(() => {
    // Prune ONLY once conversations have loaded. `openTabIds` is restored from
    // localStorage at boot, but the per-account conversations load ASYNC (after the
    // userId/DB resolve) — so pruning against the still-empty set would wipe every tab
    // to [] AND persist that (`redux.ts` mirrors openTabIds on change) → tabs lost on
    // every reopen. An empty store = loading or genuinely empty; a deleted conversation
    // already dispatches `closeTab` directly, so this prune is only a backstop.
    if (chat.conversations.length > 0) {
      const ids = new Set(chat.conversations.map((c) => c.id));
      const pruned = openTabIds.filter((id) => ids.has(id));
      if (pruned.length !== openTabIds.length) {
        prevOpenTabIds.current = openTabIds;
        dispatch(setOpenTabs(pruned));
        return;
      }
    }
    const seed = shouldSeedActiveTab({
      activeId: chat.activeId ?? null,
      openTabIds,
      prevOpenTabIds: prevOpenTabIds.current,
    });
    prevOpenTabIds.current = openTabIds;
    if (seed) dispatch(openTab(chat.activeId!));
  }, [chat.conversations, chat.activeId, openTabIds, dispatch]);

  // The workspace LAYOUT is the single source of truth for focus; the store's `activeId`
  // MIRRORS the focused pane's active conversation. One-directional (layout → activeId) so
  // there's no oscillation; an externally-set activeId (account load) is seeded into the
  // layout by the prune/seed effect, then mirrored back here.
  useEffect(() => {
    const a = activeConvId(layout);
    if (a !== (chat.activeId ?? null)) chat.setActiveId(a);
  }, [layout, chat.activeId, chat.setActiveId]);

  // Il n'y a PLUS de seed de démarrage. Il créait une conversation vide à froid parce
  // qu'un premier message sur le null-convId disparaissait — depuis, `ChatPane.onSend`
  // crée lui-même quand le pane n'a pas de conversation vivante (accueil, ref fantôme),
  // et « Nouvelle conversation » ne crée plus rien non plus (`showWelcomePane`) : la
  // conversation naît au PREMIER ENVOI, partout. Re-seeder ici referait exactement la
  // ligne vide « Nouvelle conversation » que la création différée supprime.
}
