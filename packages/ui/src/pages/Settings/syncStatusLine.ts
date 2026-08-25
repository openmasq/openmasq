import type { SyncStatusSnapshot } from "../../host";

/**
 * La phrase du témoin de synchro — logique pure (`.ts`), épinglée par
 * `syncStatusLine.test.ts` : c'est une phrase sur l'état réel des données de
 * l'utilisateur, elle ne doit ni rassurer à tort ni crier pour rien.
 *
 * La règle du VERDICT : le plus récent des deux événements l'emporte. Un échec suivi
 * d'un échange réussi est une panne finie — l'afficher encore apprendrait à ignorer le
 * rouge ; un succès suivi d'un échec est une panne en cours, quoi qu'ait réussi avant.
 */
export type SyncTone = "ok" | "err" | "muted";

export function syncStatusLine(
  s: SyncStatusSnapshot,
  now = Date.now(),
): { text: string; tone: SyncTone } {
  const rel = (ts: number): string => {
    const sec = Math.max(0, Math.round((now - ts) / 1000));
    if (sec < 60) return "à l'instant";
    const min = Math.round(sec / 60);
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
  };

  const failing = s.lastErrorAt !== null && (s.lastOkAt === null || s.lastErrorAt > s.lastOkAt);
  if (failing) {
    const reason = s.lastError ?? "échec";
    // Une panne DÉFINITIVE ne se promet pas réparable : « réessaiera tout seul » sur un
    // déchiffrement impossible fait attendre une issue qui ne viendra jamais, et c'est ce
    // qui apprend à ignorer le rouge. On dit alors quoi FAIRE.
    const tail = s.lastErrorFatal
      ? "Réessayer n’y changera rien : vérifiez la phrase secrète de cet appareil."
      : "Réessaiera tout seul.";
    return { text: `Échec ${rel(s.lastErrorAt!)} — ${reason}. ${tail}`, tone: "err" };
  }
  if (s.lastOkAt !== null) return { text: `Dernier échange réussi ${rel(s.lastOkAt)}.`, tone: "ok" };
  // Aucun appel depuis le lancement : pas une panne — la synchro ne parle que quand elle
  // a quelque chose à dire (phrase posée, session ouverte, conversation qui bouge).
  return { text: "Aucun échange depuis le lancement de l'app.", tone: "muted" };
}
