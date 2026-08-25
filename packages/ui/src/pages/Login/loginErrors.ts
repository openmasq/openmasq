/**
 * Ce que l'écran de connexion MONTRE d'une panne d'authentification.
 *
 * Supabase répond en anglais et en jargon de serveur ; cette fonction traduit les cas
 * qu'on sait nommer et **laisse passer le reste tel quel**. Le repli n'est pas de la
 * paresse : taire un message inconnu donnerait un formulaire qui « ne fait rien », et la
 * règle du produit est qu'une vraie panne se dit. Un message anglais est un moindre mal
 * qu'un silence — mais chaque cas qu'on apprend à nommer doit descendre ici.
 *
 * ⚠️ **« Signups not allowed » n'est pas une panne, c'est un RÉGLAGE** : le Supabase de
 * production a les inscriptions fermées (les comptes sont ouverts à la main), donc toute
 * adresse non provisionnée est refusée à l'envoi du lien. Le message brut disait
 * « Signups not allowed for this instance » en anglais sur un écran français, sans jamais
 * laisser deviner que le problème est l'adresse elle-même (constaté sur PostHog le 14/08).
 */
export function friendlyError(e: unknown): string {
  const s = typeof e === "string" ? e.trim() : e instanceof Error ? e.message.trim() : "";
  if (!s || s === "[object Object]" || /^\{.*\}$/.test(s) || /^\[.*\]$/.test(s)) {
    return "Impossible pour le moment. Vérifiez votre connexion et réessayez.";
  }
  if (/rate limit|too many|429/i.test(s)) return "Trop de tentatives. Patientez un instant puis réessayez.";
  if (/failed to fetch|network|fetch failed/i.test(s)) return "Réseau indisponible. Vérifiez votre connexion et réessayez.";
  // Les deux formulations de GoTrue : le verrou d'instance et celui du fournisseur e-mail.
  if (/signups? (?:not allowed|are disabled|is disabled)|disabled? signups?/i.test(s)) {
    return "Aucun compte pour cette adresse, et les inscriptions sont fermées pour le moment. Vérifiez l’orthographe — si elle est bonne, l’accès reste à ouvrir de notre côté.";
  }
  return s;
}
