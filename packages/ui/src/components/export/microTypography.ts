/**
 * Micro-typographie française des documents EXPORTÉS — la moitié « composition » du
 * design que personne ne voit mais que tout le monde sent : une ligne ne doit jamais
 * commencer par « ! » ni séparer « 12 » de « 000 € ».
 *
 * Une seule règle d'or, qui est ce qui rend ce module SÛR : on ne fait que remplacer
 * une espace ordinaire DÉJÀ LÀ par une insécable — jamais insérer, supprimer ou
 * réécrire un caractère. Un texte mal espacé ressort mal espacé (c'est au modèle
 * d'écrire correctement, le prompt le lui dit) ; un texte correct devient incassable.
 * C'est pourquoi il n'y a NI guillemets « intelligents » ni césure automatique ici :
 * transformer `'` ou couper un mot est génératif, et faux sur du code, un nom propre
 * ou de l'anglais.
 *
 * U+00A0 (insécable PLEINE), pas U+202F (fine) : la fine n'existe pas en WinAnsi, et
 * le repli pdf-lib (`documentPdf.ts` `toWinAnsi`) doit pouvoir imprimer le même texte.
 *
 * Appliquée au moment de la LECTURE des blocs (`documentBlocks.ts` `runsOf`), donc les
 * trois exports (HTML→PDF, DOCX, repli pdf-lib) la reçoivent d'un seul point — jamais
 * aux runs `code`, où une espace est un caractère comme un autre. Elle voit les VRAIES
 * valeurs (l'export porte le un-redacted) ; changer la nature d'une espace n'altère ni
 * le coffre ni le document stocké — le chemin est export-only.
 */

const NBSP = " ";

/** Espace simple → insécable, aux seules positions où la typographie française
 *  l'exige ET où l'intention est non ambiguë. */
export function frenchSpacing(text: string): string {
  return (
    text
      // Avant la ponctuation haute et le guillemet fermant — seulement quand elle est
      // TERMINALE (suivie d'une espace ou d'une fin), ce qui écarte d'un coup les
      // smileys « :) » / « ;( » et tout usage non typographique. L'espace doit déjà
      // exister : « https://x » (rien avant les « : ») ne matche pas non plus.
      .replace(/ ([:;!?»])(?=\s|$)/g, `${NBSP}$1`)
      // Après le guillemet ouvrant.
      .replace(/« /g, `«${NBSP}`)
      // Groupement des milliers : « 12 000 » — l'espace entre un chiffre et un groupe de
      // TROIS chiffres en fin de nombre. Un téléphone (« 06 12 34 56 78 », groupes de 2),
      // deux années (« 2026 2027 », groupe de 4) ne matchent pas.
      .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
      // Nombre + symbole monétaire ou % : « 500 € », « 45 % ».
      .replace(/(\d) (?=[€%$£])/g, `$1${NBSP}`)
  );
}
