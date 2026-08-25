/**
 * « Ta réponse est arrivée » — la logique PURE de la notification système.
 *
 * Deux décisions, et une seule est évidente :
 *
 * 1. **QUAND** : une conversation qui vient de se poser (son dernier message d'assistant
 *    n'est plus `pending`) et qu'on ne REGARDE pas. « Regarder » = la fenêtre a le focus
 *    ET c'est l'onglet actif — les tours tournent en parallèle par onglet, donc rester
 *    dans l'app pendant qu'un AUTRE fil répond compte comme être ailleurs.
 * 2. **QUOI** : jamais le contenu, jamais le TITRE de la conversation. Un titre est dérivé
 *    du premier message, donc de données réelles non redacted — et une notification
 *    atterrit dans le centre de notifications du système, s'affiche par-dessus ce qui est
 *    à l'écran, parfois sur un écran verrouillé ou partagé. Le clic mène au bon fil ;
 *    c'est lui qui identifie, pas la bannière.
 *
 * Un tour en ÉCHEC notifie aussi : partir faire autre chose et revenir devant un envoi
 * mort sans l'avoir su est exactement ce que la règle « un échec réel se dit » interdit.
 */
import { BRAND } from "@openmasq/branding";

/** Ce que la logique a besoin de savoir d'une conversation — rien de plus. */
export interface NoticeConv {
  id: string;
  messages: { role: string; pending?: boolean; error?: boolean }[];
}

/** Les ids dont le DERNIER message d'assistant est en cours de génération. */
export function pendingReplyIds(convs: readonly NoticeConv[]): Set<string> {
  const out = new Set<string>();
  for (const c of convs) {
    const last = [...c.messages].reverse().find((m) => m.role === "assistant");
    if (last?.pending) out.add(c.id);
  }
  return out;
}

/** Une conversation à annoncer : son id, et si le tour s'est terminé en échec. */
export interface ReplyNotice {
  id: string;
  failed: boolean;
}

/**
 * Les conversations qui viennent de se poser ET qu'on ne regarde pas.
 *
 * ⚠️ `prev` est l'ensemble du tick PRÉCÉDENT : la transition (`en cours` → `posé`) est ce
 * qui déclenche, jamais l'état « pas en cours » — sinon toute conversation déjà terminée
 * notifierait à chaque rendu, et l'ouverture de l'app tirerait une salve.
 */
export function repliesToAnnounce(p: {
  prev: ReadonlySet<string>;
  convs: readonly NoticeConv[];
  /** L'onglet regardé. `null` = aucun. */
  activeId: string | null;
  /** La fenêtre a le focus système. */
  focused: boolean;
}): ReplyNotice[] {
  const now = pendingReplyIds(p.convs);
  const out: ReplyNotice[] = [];
  for (const id of p.prev) {
    if (now.has(id)) continue; // toujours en cours
    const conv = p.convs.find((c) => c.id === id);
    if (!conv) continue; // supprimée pendant le tour : plus rien à ouvrir
    if (p.focused && id === p.activeId) continue; // sous les yeux : la bannière serait du bruit
    const last = [...conv.messages].reverse().find((m) => m.role === "assistant");
    out.push({ id, failed: !!last?.error });
  }
  return out;
}

/** Le texte de la bannière. Aucun contenu de conversation — voir l'en-tête du fichier. */
export function noticeText(n: ReplyNotice, modelLabel?: string): { title: string; body: string } {
  return {
    title: BRAND.name,
    body: n.failed
      ? "L'envoi a échoué — ouvrez la conversation pour réessayer."
      : modelLabel
        ? `Réponse prête · ${modelLabel}`
        : "Réponse prête.",
  };
}
