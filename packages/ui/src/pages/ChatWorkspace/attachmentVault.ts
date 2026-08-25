/**
 * LE COFFRE DE TRAVAIL D'UNE CONVERSATION, pour le redaction AU DÉPÔT des pièces jointes.
 *
 * LE DÉFAUT QU'IL FERME (mesuré le 15/08/2026, deux pièces RÉELLES d'un même dossier —
 * extrait Kbis + accord de principe de crédit, jointes à la même conversation) : chaque
 * pièce était redacted dans un coffre NEUF, donc la même personne recevait **deux faux
 * différents**. Le modèle, ne voyant que deux inconnus, répondait « NON, ces pièces ne
 * désignent pas la même personne » — et l'écran affichait deux fois le même nom en
 * affirmant qu'ils diffèrent. Sur un dossier de financement, c'est une conclusion FAUSSE
 * sur laquelle quelqu'un peut agir.
 *
 * L'invariant du moteur est « une valeur réelle → UN faux, à l'échelle de la
 * conversation » ; il ne pouvait pas tenir, puisque rien ne montrait les deux pièces au
 * même allocateur. Ce module est ce qui les lui montre.
 *
 * ⚠️ Éphémère, comme les listes d'autorisation du gate d'écriture : il vit dans le module,
 * survit à un remontage de `ChatView`, meurt avec l'app. Il n'est PAS la mémoire du
 * redaction — c'est le coffre PERSISTÉ de la conversation qui l'est (et qui sert à
 * un-redact). On s'amorce d'ailleurs sur LUI quand il existe, pour qu'une pièce déposée
 * au tour 3 reprenne les faux des tours précédents.
 */

/** Conversation → coffre de travail (fake→réel), muté par chaque passe de dépôt. */
const vaults = new Map<string, Record<string, string>>();
/** Borne : un coffre par conversation, et on n'en garde qu'un nombre raisonnable — une
 *  session longue ouvre des dizaines de conversations, et rien ici ne doit croître sans
 *  fin. L'éviction ne perd qu'une COHÉRENCE de dépôt, jamais une donnée : le coffre
 *  persisté reste la source du un-redaction. */
const MAX_CONVERSATIONS = 24;

/**
 * Le coffre de travail de `convId`, créé au besoin — amorcé par `seed` (le coffre persisté
 * de la conversation) la PREMIÈRE fois seulement : une fois qu'il vit, c'est lui qui porte
 * les attributions du tour en cours.
 */
export function attachmentVault(
  convId: string,
  seed?: Record<string, string>,
): Record<string, string> {
  const existing = vaults.get(convId);
  if (existing) return existing;
  const fresh: Record<string, string> = { ...(seed ?? {}) };
  vaults.set(convId, fresh);
  if (vaults.size > MAX_CONVERSATIONS) {
    // Map itère dans l'ordre d'insertion : la plus ancienne sort.
    const oldest = vaults.keys().next().value;
    if (oldest !== undefined) vaults.delete(oldest);
  }
  return fresh;
}

/** Oublier une conversation (test, ou brouillon adopté sous un autre id). */
export function forgetAttachmentVault(convId: string): void {
  vaults.delete(convId);
}
