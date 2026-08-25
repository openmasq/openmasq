// Le COMPLÉMENT d'adresse — « Résidence Les Chênes », « appartement 12B », « Bât. C »,
// « escalier 3 » — la ligne qu'on écrit AVANT la rue et que les formes de `addresses.ts`
// ne peuvent pas voir : elles s'ancrent sur un numéro + un type de voie, et un
// complément n'a ni l'un ni l'autre.
//
// Remonté le 11/08 : « Résidence Les Chênes, appartement 12B, 5 allée Verte, 69003 Lyon »
// ressortait avec la rue, le code postal et la ville faussés — et la résidence et le
// numéro d'appartement en CLAIR. Or c'est exactement ce qui désigne le foyer une fois la
// rue remplacée : dans une petite commune, « Résidence Les Chênes appartement 12B » suffit
// à retrouver quelqu'un.
//
// ⚠️ LA PORTE EST L'ADJACENCE, pas le mot-clé. « appartement » seul est un nom commun
// (« il cherche un appartement »), et un mot-clé nu contredirait la barre de précision du
// moteur. Un morceau n'est retenu que s'il TOUCHE une adresse déjà détectée — même ligne,
// séparé d'elle par les seuls `,`/espaces (ou par d'autres compléments enchaînés). Il ne
// crée donc jamais de détection là où il n'y a pas déjà une adresse.
import type { Detection } from "../types";
import { fakeHandle } from "../model/fakes/primitives";

/** Les mots qui ouvrent un complément. Abréviations comprises : c'est ainsi qu'on écrit
 *  une adresse sur une enveloppe. Le point final est optionnel (« Bât. » / « Bat »). */
const KEYWORD =
  "r[ée]sidence|r[ée]s|b[âa]timent|b[âa]t|immeuble|appartement|appart|appt|apt|" +
  "escalier|esc|[ée]tage|porte|lot|entr[ée]e|chez";

/** Un morceau : le mot-clé + sa valeur courte, qui s'arrête à la virgule ou à la fin de
 *  ligne. La valeur reste bornée (≤ 30 signes) — au-delà on n'est plus dans un complément
 *  mais dans une phrase. */
const CHUNK = `(?:${KEYWORD})\\.?[^\\S\\r\\n]+[\\p{L}\\p{N}][\\p{L}\\p{N}'’\\-. ]{0,29}`;

/** Une CHAÎNE de morceaux collée à ce qui suit : « Résidence X, appartement Y, ». */
const TRAILING_CHAIN = new RegExp(`(?:${CHUNK})(?:[^\\S\\r\\n]*,[^\\S\\r\\n]*(?:${CHUNK}))*[^\\S\\r\\n]*,?[^\\S\\r\\n]*$`, "iu");

/**
 * …et la chaîne qui SUIT l'adresse : « 2 mail Camille du Gast, 92600, Asnières,
 * appartement A02 ». Mesuré le 16/08/2026 sur un bail RÉEL — ce fichier ne regardait que
 * l'AVANT (« la ligne qu'on écrit AVANT la rue »), et le document, lui, l'écrit APRÈS.
 * Même conséquence, mot pour mot, que celle qui a fait naître ce détecteur : rue, code
 * postal et ville faussés, le numéro d'appartement en clair.
 *
 * ⚠️ Le morceau TRAÎNANT est plus STRICT que le morceau qui précède, et l'asymétrie est
 * voulue : ce qui SUIT une adresse est le plus souvent une phrase (« …, 69003 Lyon, entrée
 * libre de 9h à 18h »), là où ce qui la précède est une ligne d'adresse. Il doit donc être
 * un CODE — le mot-clé puis UN SEUL jeton alphanumérique portant un chiffre. Deux choses en
 * découlent, et les deux sont nécessaires : « entrée libre » ne passe pas (aucun chiffre),
 * et la valeur ne peut pas déborder sur la suite de la ligne — le document réel écrit
 * « appartement A02 Loyer de 650 eur » SANS virgule, et une valeur gloutonne aurait emporté
 * le loyer. Over-redact est un échec produit (barre de précision du `CLAUDE.md`) : on
 * préfère rater un « bâtiment C » traînant, forme que le côté AVANT couvre déjà.
 */
const TRAIL_CHUNK = `(?:${KEYWORD})\\.?[^\\S\\r\\n]+[\\p{L}\\p{N}]{1,10}`;
// ⚠️ UN retour à la ligne est toléré AVANT le morceau, et un seul : un bloc d'adresse se
// replie (« …, 92600, Asnières,\nappartement A02 » — mesuré sur le persona courtier, où le
// complément partait EN CLAIR pour ce seul motif). C'est le même arbitrage que le joint `W`
// des formes d'adresse : ce qui autorise le repli, c'est que le MOT-CLÉ ancre le morceau —
// rien d'autre ne peut s'y glisser — et ici s'y ajoute l'exigence d'un jeton-code chiffré.
const LEADING_CHAIN = new RegExp(
  `^[^\\S\\r\\n]*,?(?:[^\\S\\r\\n]*\\r?\\n)?[^\\S\\r\\n]*(?:${TRAIL_CHUNK})(?:[^\\S\\r\\n]*,[^\\S\\r\\n]*(?:${TRAIL_CHUNK}))*`,
  "iu",
);
const hasDigit = (chunk: string): boolean => /\d/.test(chunk.split(/\s+/).slice(1).join(" "));

/**
 * Les compléments qui PRÉCÈDENT immédiatement une adresse détectée.
 *
 * `addresses` doit porter les détections d'adresse avec leur `start` (celles de
 * `detectAddresses`) : c'est l'ancre. Chaque morceau devient sa propre détection
 * `ADDRESS`, dans le pays de l'adresse qu'il complète — donc faussé avec elle.
 */
export function detectAddressComplements(text: string, addresses: Detection[]): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const addr of addresses) {
    if (addr.category !== "ADDRESS" || addr.start == null) continue;
    // APRÈS l'adresse — plus strict (cf. `TRAIL_CHUNK` + `hasDigit`), et au plus UN repli.
    const end = addr.start + addr.value.length;
    const wrap = text.indexOf("\n", end);
    const secondEol = wrap === -1 ? -1 : text.indexOf("\n", wrap + 1);
    const lineEnd = wrap === -1 ? text.length : secondEol === -1 ? text.length : secondEol;
    const apres = LEADING_CHAIN.exec(text.slice(end, lineEnd));
    if (apres) {
      for (const m of apres[0].matchAll(new RegExp(TRAIL_CHUNK, "giu"))) {
        const value = m[0].replace(/[\s,.]+$/, "");
        if (value.length < 5 || !hasDigit(value)) continue;
        const key = `ADDRESS::${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value, category: "ADDRESS", country: addr.country, start: end + apres.index + m.index });
      }
    }
    // Le texte depuis le début de la LIGNE de l'adresse jusqu'à son premier caractère.
    const lineStart = text.lastIndexOf("\n", addr.start - 1) + 1;
    const before = text.slice(lineStart, addr.start);
    if (!before.trim()) continue;
    const chain = TRAILING_CHAIN.exec(before);
    if (!chain) continue;
    // Chaque morceau de la chaîne, isolément : un faux par complément, comme pour le
    // reste — un seul span « Résidence X, appartement Y » donnerait un faux unique dont
    // la ponctuation interne serait inventée.
    for (const m of chain[0].matchAll(new RegExp(CHUNK, "giu"))) {
      const value = m[0].replace(/[\s,.]+$/, "");
      if (value.length < 5) continue;
      // ⚠️ Le tell de la PROSE est l'article indéfini : « il cherche un appartement
      // 3 pièces, 12 rue de la Paix » n'est pas une adresse à trois lignes. Un
      // complément d'adresse ne s'introduit pas, il s'écrit sec.
      const head = chain[0].slice(0, m.index).trimEnd();
      const beforeChunk = head ? head : before.slice(0, chain.index).trimEnd();
      if (/\b(?:un|une|des|du|le|la|les|ce|cet|cette|mon|ma|notre|leur)$/i.test(beforeChunk)) continue;
      // Une désignation tient en trois mots (« Les Chênes », « 12B », « C ») ; au-delà
      // on lit une phrase qui commence par le mot-clé.
      if (value.split(/\s+/).length > 4) continue;
      const key = `ADDRESS::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        value,
        category: "ADDRESS",
        country: addr.country,
        start: lineStart + chain.index + m.index,
      });
    }
  }
  return out;
}

/**
 * Le FAUX d'un complément — le mot-clé RESTE, le code change.
 *
 * ⚠️ Sans lui, « appartement A02 » recevait « 27 CHEMIN des Tilleuls » : la catégorie est
 * ADDRESS, et la branche ADDRESS fabrique toujours une RUE. Un faux doit être de même
 * nature que la valeur (`model/CLAUDE.md`) — un complément qui devient une rue invente un
 * second lieu là où le document en désignait un seul, et le modèle raisonne dessus.
 *
 * BORNÉ AU CAS-CODE, exprès : seulement si la queue porte un chiffre. « Résidence Les
 * Chênes » est un NOM, et le brouillage lettre à lettre en ferait un mot illisible ; ce
 * cas-là garde le chemin d'avant, inchangé. `fakeHandle` préserve la classe de chaque
 * caractère (chiffre → chiffre, majuscule → majuscule), donc « A02 » reste un code
 * d'appartement crédible.
 */
export function fakeAddressComplement(value: string, seed: number): string | null {
  const m = new RegExp(`^((?:${KEYWORD})\\.?[^\\S\\r\\n]+)(.+)$`, "iu").exec(value.trim());
  if (!m || !/\d/.test(m[2])) return null;
  const fake = fakeHandle(m[2], seed);
  // « escalier 0 » n'existe pas : un zéro de tête ne se lit comme un code que si
  // l'original en portait un (« porte 03 »). `fakeHandle` tire les chiffres uniformément,
  // il faut donc le lui dire.
  const zéroteté = fake.startsWith("0") && !m[2].startsWith("0");
  return m[1] + (zéroteté ? String(1 + (seed % 9)) + fake.slice(1) : fake);
}
