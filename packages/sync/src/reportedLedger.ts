import type { PassphraseStore } from "./accountPassphrase";

/**
 * Le journal de DÉDOUBLONNAGE de l'audit d'organisation — par compte, et sans valeur en clair.
 *
 * ══ CE QU'IL FAISAIT ═══════════════════════════════════════════════════════════
 *
 * La table de faits d'une organisation est append-only : une valeur redacted ne doit être
 * comptée qu'une fois, d'où ce journal de ce qui a déjà été rapporté. Il avait deux défauts,
 * et ils sont indépendants l'un de l'autre :
 *
 *  1. **Une seule clé par appareil.** Les valeurs rapportées par le compte A empêchaient
 *     l'organisation de B de compter les siennes — un SOUS-COMPTAGE silencieux, dans les deux
 *     sens, sur un tableau de bord qu'un administrateur lit comme la vérité.
 *  2. **Il stockait les valeurs RÉELLES en clair.** De la vraie PII (noms, e-mails, numéros)
 *     dormait dans le stockage local — c'est-à-dire, sur le bureau, du LevelDB Chromium en
 *     clair sur le disque : exactement ce que les magasins de secrets refusent par principe.
 *     Or le journal n'a jamais eu besoin des valeurs : il a besoin de savoir SI une valeur y
 *     est déjà. Une empreinte répond à cette question-là et à aucune autre.
 *
 * ══ L'EMPREINTE, ET SON SEL ════════════════════════════════════════════════════
 *
 * SHA-256 sur `<sel>:<valeur>`, tronqué à 128 bits (les collisions y sont hors de portée, et
 * une collision ne ferait de toute façon que ne pas recompter une valeur). Le SEL est tiré au
 * hasard une fois par installation et rangé à côté.
 *
 * ⚠️ Ce qu'il apporte, exactement : sans lui, un e-mail ou un téléphone se retrouvent par
 * simple table pré-calculée — l'espace de ces valeurs est petit. Avec lui, une table
 * générique ne sert plus à rien. Il ne protège PAS contre quelqu'un qui a le fichier ET
 * teste une valeur précise : il a le sel aussi. C'est une défense contre la lecture de
 * masse (une sauvegarde, un disque récupéré), pas contre une attaque ciblée — et c'est la
 * défense qui correspond au risque réel d'un journal local.
 */

/** Ce que l'appelant manipule : des VALEURS. Les empreintes ne sortent jamais d'ici.
 *  ⚠️ `open()` charge UNE fois — `seen` par valeur relirait le stockage à chaque tour d'une
 *  boucle qui compte les entrées de tous les coffres. */
export interface OpenedLedger {
  /** Cette valeur a-t-elle déjà été rapportée (donc : à ne pas recompter) ? */
  seen(value: string): Promise<boolean>;
  /** Marquer des valeurs comme rapportées et PERSISTER. À n'appeler qu'après un envoi
   *  réussi : une panne du backend doit laisser le delta à retenter, pas le perdre. */
  mark(values: readonly string[]): Promise<void>;
}

export interface ReportedLedger {
  open(): Promise<OpenedLedger>;
}

export interface ReportedLedgerOptions {
  store: PassphraseStore;
  /** L'ancienne clé, sans compte — migrée puis adoptée une fois. */
  legacyKey: string;
  accountId: () => Promise<string | null | undefined>;
}

const HEX = /^[0-9a-f]{32}$/;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function reportedLedger(opts: ReportedLedgerOptions): ReportedLedger {
  const saltKey = `${opts.legacyKey}:salt`;
  const markerKey = `${opts.legacyKey}:adopted`;
  const scoped = (id: string) => `${opts.legacyKey}:${id}`;
  const memo = new Map<string, string>();
  let saltPromise: Promise<string> | null = null;

  const salt = (): Promise<string> =>
    (saltPromise ??= (async () => {
      const existing = await opts.store.get(saltKey);
      if (existing) return existing;
      const fresh = randomHex(16);
      await opts.store.set(saltKey, fresh);
      return fresh;
    })());

  async function digest(value: string): Promise<string> {
    const hit = memo.get(value);
    if (hit) return hit;
    const h = (await sha256Hex(`${await salt()}:${value}`)).slice(0, 32);
    memo.set(value, h);
    return h;
  }

  const readList = async (key: string): Promise<string[]> => {
    const raw = await opts.store.get(key);
    if (!raw) return [];
    try {
      const v: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const writeList = (key: string, list: string[]): Promise<void> =>
    opts.store.set(key, JSON.stringify([...new Set(list)]));

  /**
   * L'ancienne clé, en deux temps — et l'ordre est le correctif :
   *
   *  1. **Le clair disparaît TOUT DE SUITE**, même déconnecté : les entrées qui n'ont pas la
   *     forme d'une empreinte sont hachées et réécrites SUR PLACE. Attendre une connexion
   *     laisserait la PII sur le disque indéfiniment sur une machine où personne ne se
   *     reconnecte, et c'est le défaut le plus concret des deux.
   *  2. **L'adoption par compte attend, elle, une connexion** : le journal migré revient au
   *     PREMIER compte connecté (même politique que la phrase), puis un marqueur ferme la
   *     porte et la clé partagée disparaît. Le supprimer sans l'avoir donné à personne ferait
   *     re-rapporter tout l'historique — un SUR-comptage, l'autre moitié du défaut.
   */
  async function migrate(id: string | null): Promise<string[]> {
    const legacy = await readList(opts.legacyKey);
    if (legacy.length) {
      const needsHashing = legacy.some((v) => !HEX.test(v));
      if (needsHashing) {
        const hashed = await Promise.all(legacy.map((v) => (HEX.test(v) ? v : digest(v))));
        await writeList(opts.legacyKey, hashed);
        legacy.splice(0, legacy.length, ...hashed);
      }
    }
    if (!id) return []; // déconnecté : le clair est parti, l'adoption attend
    if (await opts.store.get(markerKey)) return [];
    await opts.store.set(markerKey, id);
    if (legacy.length) await writeList(scoped(id), [...(await readList(scoped(id))), ...legacy]);
    await opts.store.remove(opts.legacyKey);
    return legacy;
  }

  return {
    async open() {
      const id = (await opts.accountId()) || null;
      await migrate(id);
      const set = new Set(id ? await readList(scoped(id)) : []);
      return {
        async seen(value) {
          return set.has(await digest(value));
        },
        async mark(values) {
          // Déconnecté ⇒ rien n'a pu être rapporté, donc rien à marquer (et rien à écrire
          // sous un nom qu'un compte suivant hériterait).
          if (!id || !values.length) return;
          for (const v of values) set.add(await digest(v));
          await writeList(scoped(id), [...set]);
        },
      };
    },
  };
}
