/**
 * Formes REFORMULÉES d'une date redacted — le pendant « dates » de `placeFragments`.
 *
 * ⚠️ Le coffre associe des VALEURS exactes, et le modèle réécrit : un faux `13/08/2024`
 * recopié tel quel dans un tableau se restitue, mais la MÊME date écrite en toutes
 * lettres dans la phrase d'à côté (« du 13 août 2024 au… ») n'est la clé de rien — et
 * l'utilisateur lit une date FAUSSE présentée comme un fait sur son propre dossier,
 * d'autant plus crédible que le reste du document est juste (vécu 15/08, inventaire
 * documentaliste). Ce n'est pas la limite connue des DÉRIVATIONS (un âge calculé) :
 * c'est la même valeur, dans un autre format — donc restituable, déterministiquement.
 *
 * On dérive, pour chaque entrée du coffre dont le faux ET le réel sont des dates
 * `jj/mm/aaaa`, les paires « forme longue du faux → forme longue du réel ». Dérivé en
 * LECTURE seule au moment de la restitution (`unredact`), comme `placeFragments` : aucun
 * coffre stocké n'est réécrit, et une entrée existante gagne toujours.
 */

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

interface Parsed {
  day: number;
  month: number; // 1-12
  year: string;
}

function parse(v: string): Parsed | null {
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month, year: m[3] };
}

/** La forme d'affichage française : jour sans zéro de tête (« 1er » pour le premier). */
function longForm(p: Parsed): string {
  const day = p.day === 1 ? "1er" : String(p.day);
  return `${day} ${MOIS[p.month - 1]} ${p.year}`;
}

/** Les graphies du JOUR que le modèle emploie réellement : « 5 », « 05 », « 1er ». */
function dayForms(day: number): string[] {
  const forms = [String(day)];
  if (day < 10) forms.push(`0${day}`);
  if (day === 1) forms.push("1er");
  return forms;
}

/**
 * Les paires dérivées `[fauxLong, réelLong]` d'une entrée de coffre, ou `[]` quand l'une
 * des deux valeurs n'est pas une date `jj/mm/aaaa`. Le réel garde UNE forme canonique
 * (jour sans zéro) ; le faux couvre les graphies plausibles du modèle. L'accent d'
 * « août » est déjà toléré par le motif de restitution (`accentTolerantSource`).
 */
export function dateReformPairs(fake: string, real: string): Array<[string, string]> {
  const pf = parse(fake);
  const pr = parse(real);
  if (!pf || !pr) return [];
  const realLong = longForm(pr);
  return dayForms(pf.day).map((d) => [`${d} ${MOIS[pf.month - 1]} ${pf.year}`, realLong]);
}
