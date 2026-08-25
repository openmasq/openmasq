/**
 * Le TÉMOIN de la synchro — ce que « ça marche » veut dire, enregistré au seul endroit
 * qui le sait : le fetch du transport.
 *
 * La synchro est best-effort par contrat (pas de phrase ⇒ no-op, serveur mort ⇒ silence),
 * et c'est le bon contrat pour ne jamais casser un envoi — mais il rend une panne
 * INVISIBLE : « les deux apps semblent ne pas se synchroniser » sans le moindre indice,
 * alors qu'en dessous chaque appel échouait vers une API qui répond 500. Ce module
 * n'ajoute aucun comportement : il OBSERVE, et Réglages → Synchronisation le montre.
 *
 * ⚠️ Un 4xx est un ÉCHEC, pas un échange : 401 (jeton), 403 (appareil révoqué — la
 * pierre tombale), 503 (secret d'appareil absent côté serveur) sont précisément les
 * pannes que le témoin existe pour montrer. « Le réseau marche » n'est pas « la synchro
 * marche ». Session seulement, pas de persistance : le témoin dit ce que CETTE session
 * a vécu — « aucun échange depuis le lancement » est une information, pas un manque.
 *
 * ⚠️ **Et le transport ne voit pas tout.** Une panne de DÉCHIFFREMENT (la phrase de cet
 * appareil n'ouvre pas l'enveloppe de clé) laisse chaque requête HTTP réussir : le témoin
 * annonçait donc « dernier échange réussi » sur une synchro complètement morte — c'est
 * exactement le trou qu'il existait pour fermer (mesuré le 14/08 sur `@integrations`).
 * `recordCryptoFailure` est l'autre entrée, alimentée par le `onError` du client, et elle
 * est FATALE : réessayer ne peut pas la réparer, alors la phrase affichée ne doit pas
 * promettre le contraire.
 */

export interface SyncExchangeState {
  lastOkAt: number | null;
  lastErrorAt: number | null;
  /** Une raison COURTE et humaine (« HTTP 403 », « injoignable ») — jamais un corps de
   *  réponse, qui pourrait porter des données. */
  lastError: string | null;
  /** La panne ne se réparera pas toute seule : un humain doit agir (corriger la phrase
   *  secrète). Ce qui change la PHRASE affichée, pas seulement sa couleur. */
  lastErrorFatal: boolean;
}

const state: SyncExchangeState = {
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  lastErrorFatal: false,
};

export function getExchangeState(): SyncExchangeState {
  return { ...state };
}

/** Tests uniquement. */
export function resetExchangeState(): void {
  state.lastOkAt = null;
  state.lastErrorAt = null;
  state.lastError = null;
  state.lastErrorFatal = false;
}

/** La classification PURE d'une issue d'appel — épinglée par `status.test.ts`. */
export function classifyOutcome(
  outcome: { ok: true } | { ok: false; status: number } | { ok: false; network: true },
): { ok: boolean; reason: string | null } {
  if (outcome.ok) return { ok: true, reason: null };
  if ("network" in outcome) return { ok: false, reason: "serveur injoignable" };
  return { ok: false, reason: `HTTP ${outcome.status}` };
}

export function recordExchange(ok: boolean, reason: string | null, now = Date.now()): void {
  if (ok) {
    state.lastOkAt = now;
    // Un échange qui passe lève le caractère fatal : la phrase a pu être corrigée entre-temps.
    state.lastErrorFatal = false;
  } else {
    state.lastErrorAt = now;
    state.lastError = reason;
    state.lastErrorFatal = false;
  }
}

/**
 * La panne que le transport ne peut PAS voir : les octets arrivent, la clé ne les ouvre
 * pas. Marquée fatale — c'est ce qui empêche l'écran de promettre « réessaiera tout seul »
 * sur quelque chose qu'aucun essai ne réparera.
 */
export function recordCryptoFailure(reason: string, now = Date.now()): void {
  state.lastErrorAt = now;
  state.lastError = reason;
  state.lastErrorFatal = true;
}

/**
 * Enrobe le fetch du transport : chaque appel de synchro nourrit le témoin, la réponse
 * repart INTACTE — l'appelant garde son contrat, erreurs comprises.
 */
export function withExchangeWitness(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    try {
      const res = await fetchImpl(input, init);
      const verdict = classifyOutcome(res.ok ? { ok: true } : { ok: false, status: res.status });
      recordExchange(verdict.ok, verdict.reason);
      return res;
    } catch (err) {
      const verdict = classifyOutcome({ ok: false, network: true });
      recordExchange(verdict.ok, verdict.reason);
      throw err;
    }
  };
}
