import type { McpServerInfo } from "./types";

/*
 * Retry ciblé de la reconnexion SILENCIEUSE d'un connecteur distant (HTTP/OAuth).
 *
 * Pourquoi : au démarrage (et à chaque bascule de compte), `mcpReconnectStored`
 * reconnecte TOUS les connecteurs en parallèle, best-effort, en UNE tentative
 * chacun. Un connecteur HTTP fait alors un refresh OAuth + un handshake JSON-RPC ;
 * sous charge (plusieurs instances, ou simplement un réseau lent), certains
 * échouent sur un timeout transitoire — et restent absents jusqu'à ce que
 * l'utilisateur les reconnecte à la main. Le bench e2e l'a mesuré : notion/airtable
 * (distants) non reconnectés là où gmail/calendar (OAuth on-device) tenaient.
 *
 * La subtilité : NE PAS retenter un échec PERMANENT (autorisation expirée, serveur
 * sans inscription OAuth, clé refusée) — retenter n'y changerait rien et allongerait
 * le démarrage. On ne retente que le transitoire (réseau/timeout/handshake).
 */

// Un échec dont retenter ne changerait rien : l'utilisateur doit ré-autoriser, ou le
// serveur ne supporte pas le flux — surfacer tout de suite, ne pas boucler.
//
// ⚠️ La liste doit parler la langue des FOURNISSEURS, pas la nôtre. Elle ne portait que
// nos propres formulations (« authorization required/failed »), si bien que TOUTES les
// façons dont un serveur annonce une autorisation morte passaient pour du transitoire :
// `invalid_grant` (le code standard OAuth2), « Refresh token is invalid. » (Vercel),
// « Token has been expired or revoked. » (Google), un 401/403 nu. Chaque connecteur
// expiré payait donc 3 tentatives vouées à l'échec + le backoff, à CHAQUE démarrage et à
// chaque bascule de compte — exactement ce que ce filtre existe pour éviter (15/08).
// Un jeton mort ne ressuscite pas en réessayant : seul l'utilisateur peut ré-autoriser.
const PERMANENT_RE =
  /authorization required|authorization failed|dynamic client registration|clé api refusée|url refusée|unknown server|no url|invalid[_ ]grant|refresh token|expired or revoked|token (?:has )?(?:is )?(?:been )?(?:expired|revoked|invalid)|\b401\b|\b403\b|unauthorized|forbidden|invalid[_ ]client/i;

/** `true` = échec transitoire, un retry a une chance ; `false` = permanent (ou pas
 *  d'erreur du tout). Sans message, on considère l'échec comme non-retentable. */
export function isTransientConnectError(error: string | undefined): boolean {
  return !!error && !PERMANENT_RE.test(error);
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Tente la reconnexion, et retente sur un échec TRANSITOIRE avec un backoff
 * exponentiel. S'arrête dès que `isConnected()` est vrai, ou sur un échec permanent,
 * ou après `tries` tentatives. Best-effort : ne throw jamais (l'appelant est déjà
 * dans un `allSettled`).
 */
export async function reconnectRemoteWithRetry(
  connectOnce: () => Promise<McpServerInfo>,
  isConnected: () => boolean,
  opts: { tries?: number; baseDelayMs?: number } = {},
): Promise<McpServerInfo | undefined> {
  const tries = opts.tries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 600;
  let last: McpServerInfo | undefined;
  for (let i = 0; i < tries; i++) {
    try {
      last = await connectOnce();
    } catch {
      // connectServer ne throw quasi jamais (il RETOURNE l'erreur), mais un throw
      // inattendu est traité comme transitoire : on retente tant qu'il reste des essais.
      if (i < tries - 1) await delay(baseDelayMs * 2 ** i);
      continue;
    }
    if (isConnected()) return last;
    if (!isTransientConnectError(last.error)) return last; // permanent → inutile d'insister
    if (i < tries - 1) await delay(baseDelayMs * 2 ** i);
  }
  // Le DERNIER verdict remonte à l'appelant : c'est lui qui décide si l'échec mérite
  // d'être MONTRÉ (une autorisation morte au démarrage n'était visible nulle part).
  return last;
}

/**
 * Cet échec de reconnexion SILENCIEUSE doit-il allumer la bannière « reconnexion
 * nécessaire » ?
 *
 * L'erreur d'un connect n'est que la valeur de RETOUR de l'appel : `infoFor` ne la porte
 * pas, donc `mcp:list` non plus. Un connecteur dont le jeton avait expiré revenait donc
 * simplement ABSENT au démarrage — aucune bannière, rien sur sa fiche — et l'utilisateur
 * ne l'apprenait qu'en cliquant « Connecter » de lui-même (journal du 15/08, Vercel).
 *
 * ⚠️ Seulement sur un échec PERMANENT. Hors ligne au lancement, tout serait annoncé « à
 * reconnecter » alors qu'il ne manque que le réseau — et ça se répare tout seul.
 */
export function shouldFlagForReconnect(
  last: McpServerInfo | undefined,
  isConnected: boolean,
): boolean {
  return !isConnected && !!last?.error && !isTransientConnectError(last.error);
}
