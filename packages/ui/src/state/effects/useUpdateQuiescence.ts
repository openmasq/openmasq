import { useEffect, useRef } from "react";
import type { Host } from "../../host";

/**
 * L'app est-elle OCCUPÉE au sens de l'AUTO-INSTALLATION d'une mise à jour ? Pure, testée.
 *
 * Occupé = un envoi en vol (le flag global couvre aussi les tours agentiques et leurs
 * `run_python`), OU un brouillon non vide dans n'importe quelle conversation — les
 * brouillons sont mémoire-seulement EXPRÈS (`state/CLAUDE.md`), donc un redémarrage
 * automatique les détruirait en silence. Le doute coûte au pire une fenêtre
 * d'installation manquée ; l'inverse coûte du travail de l'utilisateur.
 */
export function updateBusy(p: {
  isStreaming: boolean;
  conversations: readonly { id: string }[];
  getDraft: (convId: string) => string;
}): boolean {
  if (p.isStreaming) return true;
  return p.conversations.some((c) => (p.getDraft(c.id) ?? "").trim().length > 0);
}

/**
 * Répond à la sonde de quiescence de main (`updates/autoInstall.ts`) : un build
 * téléchargé ne s'installe tout seul (app en arrière-plan/inactive) que si l'UI se dit
 * libre — silence = occupé côté main, donc l'absence de ce hook (aperçu web, préload
 * non redémarré) désactive l'auto-installation au lieu de la rendre aveugle.
 */
export function useUpdateQuiescence(p: {
  host: Host;
  isStreaming: boolean;
  conversations: readonly { id: string }[];
  getDraft: (convId: string) => string;
}): void {
  const ref = useRef(p);
  ref.current = p;
  useEffect(() => {
    const u = p.host.updates;
    if (!u?.onQuiescenceAsk || !u.replyQuiescence) return;
    return u.onQuiescenceAsk((askId) => {
      const { isStreaming, conversations, getDraft } = ref.current;
      u.replyQuiescence?.(askId, updateBusy({ isStreaming, conversations, getDraft }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host stable par plateforme
  }, []);
}
