/**
 * Le miroir DB traduit « une conversation connue absente de l'état » en DELETE. C'est
 * juste pour UNE suppression ; c'est un désastre quand l'état entier vient d'être VIDÉ
 * (déconnexion parasite, adoption de compte, état pas encore hydraté) : le 13/08, ce
 * balayage a traduit un vidage mémoire en suppression de TOUTES les conversations d'un
 * compte — messages, coffre et fichiers compris — dans la seule base qui les détenait.
 *
 * La règle : un état à ZÉRO conversation face à PLUSIEURS connues n'est pas une série de
 * suppressions, c'est un vidage — on ne balaie pas. Le cas légitime le plus courant reste
 * couvert : supprimer son unique conversation (1 connue → 0) balaie normalement. Une
 * suppression de masse réelle (rare) se re-synchronise au prochain chargement au pire ;
 * l'inverse — des données détruites — ne se répare pas.
 */
export function shouldSweepDeletions(stateSize: number, knownSize: number): boolean {
  return !(stateSize === 0 && knownSize > 1);
}

/**
 * La porte des canaux de SYNC (`useSyncChannel.ready`) : « prêt » veut dire « l'état
 * reflète réellement le compte », pas « la tentative de chargement est finie ».
 *
 * `store.loaded` passe à vrai MÊME quand `db.load()` a échoué (l'UI doit vivre sur le
 * miroir localStorage) — mais une sync qui démarre là tire et pousse contre un store
 * partiel : le pull fabrique des conversations SQUELETTES (titre sans messages — le
 * sinistre du 14/08 : 47 conversations vidées), le push des TOMBSTONES (« il a tout
 * supprimé »). Fail closed : DB présente mais pas hydratée ⇒ pas de sync cette session.
 * Sans DB (aperçu navigateur, mobile), l'état localStorage EST l'hydratation.
 */
export function isSyncReady(loaded: boolean, hasDb: boolean, dbHydrated: boolean): boolean {
  return loaded && (!hasDb || dbHydrated);
}

/** Le balayage du miroir, garde comprise : supprime de la base les conversations que le
 *  carnet connaît et que l'état n'a plus — sauf quand l'écart a la signature d'un VIDAGE
 *  (voir ci-dessus), auquel cas rien n'est supprimé et le refus est loggué. */
export function sweepDeletions(
  known: ReadonlyMap<string, unknown>,
  current: ReadonlyMap<string, unknown>,
  del: (id: string) => void,
): void {
  if (!shouldSweepDeletions(current.size, known.size)) {
    console.error(`[db] balayage REFUSÉ : état vide face à ${known.size} conversations connues — vidage probable, rien n'est supprimé`);
    return;
  }
  for (const id of known.keys()) if (!current.has(id)) del(id);
}
