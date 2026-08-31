import { useCallback, useEffect, useState } from "react";
import { useHost } from "../../host";
import type { OrgShareView, OrgSharesHost } from "../../host/orgShares";

/**
 * The org-share surface: the shares this account may see and the actions —
 * all through the optional `host.orgShares` (absent ⇒ `available: false` and
 * every list is empty; callers render nothing actionable). The `can*` flags on
 * each share come from the SERVER — the UI greys on them, never re-derives the
 * matrix, and the backend re-checks every call anyway.
 */
/**
 * La cloche « Demandes » existe-t-elle ? Pure et testée (`shareInboxVisible.test.ts`).
 *
 * Trois conditions, toutes nécessaires : le créneau `host.orgShares` (un build sans
 * backend n'a rien à lister), ET une raison d'exister — l'appartenance à une
 * organisation (les partages voyagent entre membres), ou des partages déjà présents
 * (le reliquat d'une organisation quittée reste décidable/révocable). Une cloche
 * montée pour un compte solo, ou hors connexion, est un bouton qui n'annoncera
 * jamais rien : du bruit, pas une invitation.
 */
export function shareInboxVisible(p: {
  available: boolean;
  inOrg: boolean;
  shareCount: number;
}): boolean {
  return p.available && (p.inOrg || p.shareCount > 0);
}

export function useOrgShares(scope?: "coffre" | "userdata"): {
  available: boolean;
  api: OrgSharesHost | null;
  shares: OrgShareView[];
  reload: () => Promise<void>;
  decide: (shareUuid: string, approve: boolean) => Promise<void>;
  revoke: (shareUuid: string) => Promise<void>;
} {
  const host = useHost();
  const api = host.orgShares ?? null;
  const [shares, setShares] = useState<OrgShareView[]>([]);

  const reload = useCallback(async () => {
    if (!api) return;
    const all = await api.list();
    setShares(scope ? all.filter((s) => s.scope === scope) : all);
  }, [api, scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = useCallback(
    async (shareUuid: string, approve: boolean) => {
      if (!api) return;
      await api.decide(shareUuid, approve);
      await reload();
    },
    [api, reload],
  );

  const revoke = useCallback(
    async (shareUuid: string) => {
      if (!api) return;
      await api.revoke(shareUuid);
      await reload();
    },
    [api, reload],
  );

  return { available: !!api, api, shares, reload, decide, revoke };
}
