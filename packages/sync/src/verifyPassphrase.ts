/**
 * Vérifier qu'une phrase secrète ouvre les enveloppes de clés DÉJÀ stockées côté serveur.
 *
 * Sans cette vérification, saisir une phrase différente de celle des autres appareils ne
 * produit AUCUN signal : chaque appel HTTP réussit, et l'appareil vit dans un monde
 * crypto parallèle — il pousse des records que les autres ne liront jamais, et scelle
 * (`dekFor`) chaque portée dont l'enveloppe vient d'ailleurs. C'est la divergence
 * constatée le 14/08 sur `@integrations` : la cascade serveur avait effacé les
 * enveloppes, le premier appareil à re-frapper a gagné (premier-écrivain), et l'autre —
 * à phrase différente depuis toujours, silencieusement — s'est retrouvé verrouillé.
 *
 * Le verdict est INFORMATIF, jamais bloquant : une phrase volontairement neuve (première
 * installation, phrase perdue) est légitime — l'app la pose quand même et DIT la
 * conséquence, au lieu de la laisser se découvrir des semaines plus tard.
 */
import { openConvKey } from "./crypto";
import type { RecordTransport } from "./types";

export type PassphraseVerdict =
  /** La phrase ouvre au moins une enveloppe existante — c'est bien celle du compte. */
  | "match"
  /** Des enveloppes existent et AUCUNE des sondées ne s'ouvre — une autre phrase règne. */
  | "mismatch"
  /** Aucune enveloppe côté serveur — premier appareil, toute phrase est la bonne. */
  | "no-envelopes"
  /** Serveur injoignable / non connecté — on ne sait pas, on ne bloque pas. */
  | "unreachable";

/** Combien d'enveloppes sonder au plus : une seule suffit en théorie, mais un compte
 *  déjà divergé porte des enveloppes des DEUX mondes — en sonder plusieurs évite de
 *  déclarer « mismatch » sur la seule enveloppe de l'autre appareil. */
const PROBES = 3;

export async function verifyPassphrase(
  transport: RecordTransport,
  passphrase: string,
): Promise<PassphraseVerdict> {
  let convIds: string[];
  try {
    convIds = await transport.listConvKeys();
  } catch {
    return "unreachable";
  }
  if (!convIds.length) return "no-envelopes";
  let probed = 0;
  for (const convId of convIds.slice(0, PROBES * 2)) {
    let envelope;
    try {
      envelope = await transport.getConvKey(convId);
    } catch {
      continue; // réseau intermittent sur UNE enveloppe → essayer la suivante
    }
    if (!envelope) continue;
    probed++;
    try {
      await openConvKey(envelope, passphrase);
      return "match";
    } catch {
      /* pas celle-ci — continuer */
    }
    if (probed >= PROBES) break;
  }
  return probed ? "mismatch" : "unreachable";
}
