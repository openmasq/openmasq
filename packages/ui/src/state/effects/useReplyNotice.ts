import { useEffect, useRef } from "react";
import type { Conversation, Settings } from "../../types";
import type { Host } from "../../host";
import { findModelAny } from "../../prompt/models";
import { noticeText, pendingReplyIds, repliesToAnnounce } from "../replyNotice";

/**
 * La notification système « ta réponse est arrivée » — l'OBSERVATEUR.
 *
 * ⚠️ Il regarde l'ÉTAT, il ne se branche pas sur la fin d'un envoi. Un tour se pose par
 * une demi-douzaine de chemins (flux terminé, flux en erreur, boucle d'outils, refus
 * fail-closed, arrêt manuel), tous dans `store.ts` : accrocher chacun, c'est en oublier
 * un au prochain chemin ajouté, et personne ne verra que la notification a disparu. Une
 * seule transition observée (`pending` → plus `pending`) les couvre tous par construction.
 *
 * Le QUAND et le QUOI sont purs et testés (`state/replyNotice.ts`). Ici : le focus de la
 * fenêtre, l'appel plateforme, et le clic qui ramène au bon fil.
 */
export function useReplyNotice(p: {
  conversations: Conversation[];
  activeId: string | null;
  settings: Settings;
  host: Host;
  /** Ouvrir la conversation cliquée (la plateforme a déjà focalisé la fenêtre). */
  onOpen: (conversationId: string) => void;
}): void {
  const { conversations, activeId, settings, host, onOpen } = p;
  // Absent ⇒ le réglage n'est pas offert non plus (voir `AccountTab`) : rien à faire.
  const on = !!host.notify && settings.notifyOnReply !== false;

  // L'ensemble « en cours » du tick précédent. Une ref, pas un state : le comparer ne doit
  // pas provoquer le rendu qui le recalcule.
  const pendingRef = useRef<Set<string>>(new Set());
  // Le focus système, lu par événement plutôt que par `document.hasFocus()` à la volée :
  // la transition arrive dans un effet, donc APRÈS le rendu, et l'appel ponctuel se lit
  // parfois avant que le navigateur ait rendu le focus à la fenêtre.
  const focusedRef = useRef(typeof document === "undefined" || document.hasFocus());
  useEffect(() => {
    const set = (v: boolean) => () => {
      focusedRef.current = v;
    };
    const onFocus = set(true);
    const onBlur = set(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Le clic ramène au fil. Abonné même quand le réglage est OFF : une bannière peut
  // survivre dans le centre de notifications à une désactivation, et la cliquer doit
  // continuer d'ouvrir la bonne conversation plutôt que ne rien faire.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    return host.notify?.onActivate((id) => openRef.current(id)); // l'unsubscribe, explicite
  }, [host]);

  useEffect(() => {
    const prev = pendingRef.current;
    pendingRef.current = pendingReplyIds(conversations);
    if (!on) return;
    const notices = repliesToAnnounce({
      prev,
      convs: conversations,
      activeId,
      focused: focusedRef.current,
    });
    for (const n of notices) {
      const conv = conversations.find((c) => c.id === n.id);
      const label = conv?.modelId ? findModelAny(conv.modelId)?.label : undefined;
      const { title, body } = noticeText(n, label);
      host.notify?.reply({ conversationId: n.id, title, body });
    }
  }, [conversations, activeId, on, host]);
}
