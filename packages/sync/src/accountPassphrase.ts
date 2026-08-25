/**
 * La PHRASE E2E rangée PAR COMPTE, sur un magasin clé→valeur quelconque.
 *
 * ══ POURQUOI CE MODULE EXISTE ══════════════════════════════════════════════════
 *
 * La phrase était rangée sous UNE clé par appareil sur les trois surfaces. Rien ne
 * l'effaçant au changement de compte, le compte suivant se retrouvait synchronisé
 * **avec la clé du précédent** : il n'avait rien demandé, et surtout il ne DÉTIENT pas
 * la clé qui chiffre ses propres coffres — quelqu'un d'autre l'a choisie et la connaît.
 * La promesse E2E (« personne d'autre que vous ») était fausse pour lui.
 *
 * La politique tient en deux règles, et elles sont subtiles toutes les deux :
 *
 *  1. **On RANGE par compte, on n'EFFACE jamais au changement.** Il n'existe aucun
 *     séquestre : une phrase perdue orpheline définitivement les coffres déjà
 *     synchronisés de ce compte. Revenir sur le premier compte doit retrouver la sienne
 *     sans la retaper — c'est le rangement qui isole, pas la destruction.
 *  2. **L'ancienne valeur sans compte revient au PREMIER compte connecté**, une seule
 *     fois, puis un marqueur ferme la porte pour tous les autres et la clé héritée est
 *     supprimée. C'est son propriétaire dans l'immense majorité des cas, et c'est le seul
 *     qui perdrait quelque chose ; les suivants repartent sans phrase, donc sans synchro,
 *     ce qui est exactement l'état correct pour eux.
 *
 * Il vit ICI parce que mobile et extension appliquent la MÊME politique sur deux magasins
 * différents (`@capacitor/preferences`, `chrome.storage.local`) : deux copies de ces deux
 * règles auraient divergé, et c'est le genre d'écart qui ne se voit qu'après coup. Le
 * bureau ne l'utilise pas — sa famille à lui est celle des secrets chiffrés du processus
 * principal (`accountSecretFile`, calquée sur `keys.ts`), et l'aligner sur celle-ci
 * l'aurait sorti de la seule dont il partage les risques.
 */

/** Le strict minimum qu'un magasin doit offrir. `get` peut rendre `undefined` : les deux
 *  implémentations le font, et l'imposer à `null` ferait un adaptateur chez chacune. */
export interface PassphraseStore {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface AccountPassphraseOptions {
  store: PassphraseStore;
  /** L'ancienne clé, sans compte — celle qu'on adopte une fois puis qu'on supprime. */
  legacyKey: string;
  /** La clé du compte. Défaut : `<legacyKey>:<sub>`. */
  scopedKey?: (accountId: string) => string;
  /** Le marqueur d'adoption. Défaut : `<legacyKey>:adopted`. */
  markerKey?: string;
  /** Le compte connecté (`sub`), ou `null`. */
  accountId: () => Promise<string | null | undefined>;
}

export interface AccountPassphrase {
  /** La phrase de CE compte. `null` déconnecté — donc synchro éteinte, ce qui est correct. */
  get(): Promise<string | null>;
  /** Poser la phrase. **Lève** sans compte : un « c'est enregistré » qui n'a rien
   *  enregistré est le défaut qu'on corrige, pas un cas à avaler. */
  set(passphrase: string): Promise<void>;
  /** Éteindre la synchro pour CE compte. Les autres comptes gardent la leur. */
  clear(): Promise<void>;
}

export function accountPassphrase(opts: AccountPassphraseOptions): AccountPassphrase {
  const scoped = opts.scopedKey ?? ((id: string) => `${opts.legacyKey}:${id}`);
  const marker = opts.markerKey ?? `${opts.legacyKey}:adopted`;

  /**
   * L'adoption unique. ⚠️ Elle ne peut PAS s'exécuter sans compte : sans cela le premier
   * lancement déconnecté supprimerait la clé héritée et la phrase serait perdue pour tout
   * le monde. Et la clé héritée n'est retirée qu'APRÈS l'écriture réussie du casier du
   * compte — l'ordre est le correctif, l'inverse perd la phrase si l'écriture échoue.
   */
  async function adoptLegacy(accountId: string): Promise<string | null> {
    if (await opts.store.get(marker)) return null; // déjà réclamée par un compte
    const legacy = await opts.store.get(opts.legacyKey);
    if (!legacy) {
      await opts.store.set(marker, accountId); // rien à adopter — on ferme la porte
      return null;
    }
    await opts.store.set(scoped(accountId), legacy);
    await opts.store.set(marker, accountId);
    await opts.store.remove(opts.legacyKey);
    return legacy;
  }

  return {
    async get() {
      const id = await opts.accountId();
      if (!id) return null;
      const mine = await opts.store.get(scoped(id));
      if (mine) return mine;
      return (await adoptLegacy(id)) ?? null;
    },
    async set(passphrase) {
      const id = await opts.accountId();
      if (!id) throw new Error("no account — refusing to store the sync passphrase");
      await opts.store.set(scoped(id), passphrase);
      // Le compte a désormais SA phrase : l'héritée n'a plus lieu d'être adoptée par lui,
      // et la laisser en place la donnerait au prochain compte.
      await opts.store.set(marker, id);
      await opts.store.remove(opts.legacyKey);
    },
    async clear() {
      const id = await opts.accountId();
      if (!id) return; // rien à éteindre pour personne
      await opts.store.remove(scoped(id));
      // On ferme aussi la porte de l'adoption : sans ça, éteindre la synchro puis
      // recharger ferait ré-adopter l'ancienne phrase — la réactivation, à l'identique.
      await opts.store.set(marker, id);
      await opts.store.remove(opts.legacyKey);
    },
  };
}
