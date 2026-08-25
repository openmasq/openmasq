import { BANK_OP_CODES } from "../vocab/vie";

/**
 * Les bords d'un span détecté, sans la ponctuation qui l'entoure.
 *
 * ⚠️ Ce n'est pas cosmétique. Un span mal borné garde une virgule ou un point — et la
 * valeur cesse alors d'être ELLE-MÊME pour tout ce qui compare des chaînes : la liste de
 * notoriété (mesuré : « Github » y figure, « Github, » non — la marque partait donc
 * redacted), le `keep`, le Coffre, la liste des termes génériques. La ponctuation devient
 * aussi le premier caractère du FAUX, que le modèle relit ensuite comme un mot.
 *
 * Les tirets et apostrophes INTERNES sont préservés (« Jean-Claude », « L'Oréal ») : seuls
 * les bords sont rognés. ⚠️ Les PARENTHÈSES ne le sont pas : elles portent du sens dans un
 * composite lieu+code (« ST OUEN (93400) »), et les rogner cassait la restitution de la
 * ville seule — `placeAliases.test.ts` l'a attrapé. Une valeur entièrement ponctuation est
 * rendue telle quelle plutôt que vidée : le filtre suivant s'en chargera.
 */
export function trimSpanEdges(value: string): string {
  // Re-trim APRÈS : « Paris » laisse les espaces que les guillemets cachaient.
  const t = value.trim().replace(/^[.,;:!?…"'«»“”‘’]+|[.,;:!?…"'«»“”‘’]+$/gu, "").trim();
  return t || value.trim();
}

/**
 * Un MARQUEUR D'ÉTAT CIVIL collé en tête d'un span de NOM par le détecteur
 * (« née de La Roncheraye », « épouse N'Dranoh », « veuve Morvan ») n'est pas un
 * prénom : traité comme un jeton de nom, il recevait son propre faux et l'état civil
 * DISPARAISSAIT du wire — « née de La Roncheraye » devenait « sidonie de La
 * Guilbaud », que le modèle relit comme une AUTRE personne en apposition (le piège n° 2
 * du persona notaire, l'acte infidèle). On dépouille le marqueur — il reste VERBATIM
 * dans le texte — et le reste du span rejoint la machinerie d'identité ordinaire, qui
 * sait alors réutiliser le faux canonique de la famille. Même famille de geste que
 * `stripLeadingArticle` pour les organisations.
 *
 * Étroit exprès : mots ENTIERS, en tête seulement, et jamais au point de vider le span.
 */
/**
 * ⚠️ UNE PARENTHÈSE QUI PORTE UNE ADRESSE E-MAIL SORT DU SPAN — et c'est une FUITE qu'on
 * ferme, pas une politesse.
 *
 * Mesuré le 15/08/2026 : « Taavi Remmel (taavi.remmel@exemple.ee) » est détecté comme UN span
 * de NOM, parenthèse comprise (elles sont épargnées exprès, pour le composite
 * « ST OUEN (93400) »). Le faux devient alors « Hortense Fressineau
 * (taavi.remmel@exemple.ee) » : **l'adresse réelle part en clair**, à l'intérieur du faux,
 * et le modèle la lit comme celle de la personne inventée. La forme « Nom (e-mail) » est
 * l'idiome des listes de contacts, des comptes rendus et des exports CRM — donc pas un cas
 * de laboratoire.
 *
 * Sorti du span, l'e-mail est détecté POUR LUI-MÊME et reçoit un faux dérivé du faux nom
 * (vérifié : « Taavi Remmel, e-mail taavi.remmel@… » donne déjà « Hilaire Mabille,
 * hilaire.mabille@… »). Le rognage ne peut donc rien perdre.
 *
 * Étroit exprès : il faut un « @ » DANS la parenthèse finale. Le composite lieu+code
 * (chiffres) et une parenthèse ordinaire (« (bureau 12) ») ne bougent pas.
 */
const TRAILING_EMAIL_PAREN = /\s*[(\[][^()\[\]]*@[^()\[\]]*[)\]]\s*$/u;

export function stripTrailingEmailParen(value: string): string {
  const cut = value.replace(TRAILING_EMAIL_PAREN, "").trim();
  // Jamais au point de vider : une valeur qui n'est QUE la parenthèse est laissée aux
  // portes suivantes, comme pour l'état civil.
  return /\p{L}/u.test(cut) ? cut : value;
}

/**
 * Un CODE D'OPÉRATION bancaire collé en tête d'un span (« VIR SARL REBOUR », « CHQ 4412
 * REBOUR ») n'appartient pas à l'entité : c'est la colonne « nature » du relevé.
 *
 * Mesuré le 15/08/2026 sur un grand livre : « VIR Rebour » était détecté comme UNE
 * organisation et devenait « VOXA Group », pendant que « REBOUR » seul devenait
 * « VANTEL » — le MÊME fournisseur portait donc deux faux (le modèle lit deux
 * entreprises), et le type d'opération disparaissait du fil. Dépouillé, le reste rejoint
 * la machinerie d'identité, qui rend UN faux à toutes les formes.
 *
 * Même geste que `stripCivilStatusPrefix` : mots ENTIERS, en tête seulement, répété (un
 * relevé écrit « VIR PRLV » sur les régularisations), et jamais au point de vider le span.
 * La liste vit dans `../vocab/vie.ts` (règle 9) — le même mot y sert déjà à empêcher qu'un
 * code SEUL devienne une entité.
 */
const BANK_OP_PREFIX = new RegExp(`^(?:${BANK_OP_CODES.join("|")})[\\s.:-]+`, "iu");

export function stripBankOpPrefix(value: string): string {
  let v = value;
  for (;;) {
    const next = v.replace(BANK_OP_PREFIX, "");
    if (next === v) break;
    if (!/\p{L}/u.test(next)) return value; // ne jamais vider
    v = next;
  }
  return v.trim() || value;
}

const CIVIL_STATUS_PREFIX = /^(?:n[ée]e?|épouse|veuve?|veuf|dite?)\s+/iu;

export function stripCivilStatusPrefix(value: string): string {
  let v = value;
  // Répété : « épouse née X » arrive sur les actes recopiés.
  for (;;) {
    const next = v.replace(CIVIL_STATUS_PREFIX, "");
    if (next === v) break;
    // Ne jamais vider : un span qui N'EST QU'un marqueur n'est pas un nom, mais le
    // juger est le travail des portes suivantes — on rend la valeur intacte.
    if (!/\p{L}/u.test(next)) return value;
    v = next;
  }
  return v;
}
