/**
 * Le GABARIT de forme d'une valeur redacted — étage B de l'export « sans mapping » :
 * là où l'export supprime la paire redacted→original, il montre à la place la FORME de
 * l'original (casse, chiffres, séparateurs, longueur), calculée localement. C'est ce qui
 * permet de diagnostiquer « le détecteur IBAN a raté un IBAN à espaces insécables » sans
 * jamais voir l'IBAN.
 *
 * Ce qui peut partir / ce qui ne part jamais :
 *  - part : X (majuscule), x (minuscule), ◌ (lettre sans casse — CJK…), 9 (chiffre),
 *    les séparateurs/ponctuation VERBATIM (la structure, pas le contenu), la longueur.
 *  - ne part jamais : un caractère de la valeur elle-même ; et pour une valeur de type
 *    secret/clé, MÊME la structure est écrasée (`••• (N car.)`) — la disposition des
 *    symboles d'un mot de passe est déjà un indice.
 *
 * Résiduel assumé (dit ici, montré à l'utilisateur avant envoi) : un gabarit révèle
 * longueur + disposition — assez pour distinguer « gmail.com » de « outlook.com » à la
 * longueur, jamais pour reconstruire une valeur.
 */

/** Catégories dont la STRUCTURE même ne part pas (un secret n'a pas de « forme » sûre). */
const OPAQUE_LABELS = new Set(["secret", "apikey", "password", "token"]);

const MAX_SHAPE = 48;

/** Le gabarit brut d'une valeur (sans la règle d'opacité des secrets). */
export function valueShape(value: string): string {
  let out = "";
  for (const ch of value) {
    if (/\p{Lu}/u.test(ch)) out += "X";
    else if (/\p{Ll}/u.test(ch)) out += "x";
    else if (/\p{N}/u.test(ch)) out += "9";
    else if (/\p{L}/u.test(ch)) out += "◌"; // lettre sans casse (CJK, kana…)
    else if (/\s/u.test(ch)) out += " "; // tout blanc (NBSP compris) → une espace simple
    else out += ch; // séparateur / ponctuation : la structure, jamais le contenu
    if (out.length >= MAX_SHAPE) return `${out}… (${[...value].length} car.)`;
  }
  return out;
}

/** Le gabarit à exporter pour une paire du journal, selon sa catégorie. */
export function valueShapeFor(value: string, label?: string): string {
  if (!value) return "∅";
  if (label && OPAQUE_LABELS.has(label.toLowerCase())) return `••• (${[...value].length} car.)`;
  return valueShape(value);
}
