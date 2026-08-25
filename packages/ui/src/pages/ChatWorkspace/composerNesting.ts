import type { Detected, Item } from "./composerDetection";

/**
 * UNE pastille par identité — y compris quand une valeur est IMBRIQUÉE dans une autre.
 *
 * Le dédoublonnage de `buildDetection` est value-keyed : « 12345678 » et « 12345678Z » sont
 * deux clés distinctes, donc sur « DNI 12345678Z » l'aperçu affichait DEUX pastilles là où
 * l'envoi n'alloue QU'UN faux (mesuré au parcours RH, 17/08 : le moteur rend 3 matches pour
 * 3 valeurs, l'aperçu en montrait 4).
 *
 * ⚠️ Ce n'est pas cosmétique. Une pastille est CLIQUABLE pour « garder en clair » : celle des
 * chiffres nus proposait de un-redact la moitié d'un numéro national. Même famille que le
 * terme du Coffre reclassé qui portait deux pastilles — c'est l'aperçu qui ment, sur la
 * surface dont tout le métier est d'être crue.
 *
 * La règle : on garde le span LONG, jamais le fragment. Une valeur n'est écartée que si
 * CHACUNE de ses occurrences est STRICTEMENT contenue dans une occurrence d'une autre — deux
 * valeurs qui se chevauchent partiellement, ou qui apparaissent aussi seules ailleurs dans le
 * brouillon, gardent chacune la leur.
 */
export function dropNested(
  found: readonly { item: Item; mine: Detected[] }[],
): { item: Item; mine: Detected[] }[] {
  return found.filter(({ item, mine }) =>
    !mine.every((r) =>
      found.some(
        ({ item: autre, mine: siens }) =>
          autre.value !== item.value &&
          siens.some(
            (q) => q.start <= r.start && q.end >= r.end && q.end - q.start > r.end - r.start,
          ),
      ),
    ),
  );
}
