/**
 * Ce que l'UTILISATEUR lit quand un connecteur a échoué — le pendant lisible de
 * `connectorErrorReason` (qui, lui, ne rend qu'un enum pour la mesure).
 *
 * Avant, le message BRUT du fournisseur s'affichait tel quel, à deux endroits : dans la
 * modale, et dans la grille où il REMPLACE la description (la fiche Vercel cessait de dire
 * ce qu'est Vercel pour afficher « Refresh token is invalid. »). De l'anglais technique,
 * sans rien indiquer à faire, sur le seul écran où la réparation tient en un clic.
 *
 * Règle : on ne DÉGUISE rien — un échec reste annoncé — mais on le dit dans la langue de
 * l'utilisateur et on nomme le geste. Le texte brut n'est pas perdu : il reste dans le
 * journal de débogage, où il sert à qui diagnostique.
 *
 * ⚠️ Une famille INCONNUE rend `null` : l'appelant affiche alors le message d'origine.
 * Inventer une phrase rassurante sur une panne qu'on ne comprend pas serait pire que
 * l'anglais brut — c'est la règle « une vraie panne se dit ».
 */

/** Autorisation morte : le seul cas que l'utilisateur répare lui-même, en un clic. */
const EXPIRED_RE =
  /invalid[_ ]grant|refresh token|expired or revoked|token (?:has )?(?:is )?(?:been )?(?:expired|revoked|invalid)|\b401\b|unauthorized|authorization (?:required|failed)|invalid[_ ]client/i;
/** Le service est joignable mais nous refuse : rien à re-cliquer, c'est côté service. */
const FORBIDDEN_RE = /\b403\b|forbidden|access denied|insufficient (?:scope|permission)/i;
/** Réseau : ça remarchera tout seul. */
const NETWORK_RE =
  /fetch failed|network|econnrefused|econnreset|enotfound|etimedout|timeout|socket|dns|\b5\d\d\b|bad gateway|service unavailable/i;
/** Le serveur ne sait pas faire le flux — ni l'utilisateur ni un retry n'y peuvent rien. */
const UNSUPPORTED_RE = /dynamic client registration|unknown server|no url|url refusée/i;
/** Clé API refusée : le geste est de la remplacer, pas de se reconnecter. */
const APIKEY_RE = /clé api refusée|invalid[_ ]?api[_ ]?key|api key/i;

export interface ConnectorErrorText {
  /** La phrase montrée à la place du message brut. */
  text: string;
  /** `true` quand se reconnecter EST le geste — l'UI met alors l'accent dessus. */
  reconnect: boolean;
}

/** Rend le texte utilisateur, ou `null` si on ne sait pas (⇒ garder le brut). */
export function connectorErrorText(raw: string | undefined | null): ConnectorErrorText | null {
  const m = (raw ?? "").trim();
  if (!m) return null;
  // L'ORDRE porte la règle : une clé refusée et un 403 ressemblent à une expiration, mais
  // le geste diffère — on teste donc du plus spécifique au plus général.
  if (APIKEY_RE.test(m)) return { text: "La clé API a été refusée — vérifiez-la et saisissez-la à nouveau.", reconnect: false };
  if (UNSUPPORTED_RE.test(m)) return { text: "Ce service ne prend pas en charge la connexion automatique.", reconnect: false };
  if (FORBIDDEN_RE.test(m)) return { text: "Ce service refuse l'accès — vérifiez vos droits chez lui, puis reconnectez-vous.", reconnect: true };
  if (EXPIRED_RE.test(m)) return { text: "Votre autorisation a expiré — reconnectez-vous pour continuer.", reconnect: true };
  if (NETWORK_RE.test(m)) return { text: "Service injoignable — réessayez dans un instant.", reconnect: false };
  return null;
}
