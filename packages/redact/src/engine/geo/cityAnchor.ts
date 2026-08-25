// L'ANCRAGE PAR VILLE — une ville réelle reçoit UN lieu faux, partout.
//
// Le défaut mesuré (`bench/tokensVsFakes.md`, le plus coûteux du banc) : la même ville
// écrite dans deux adresses distinctes recevait deux lieux faux différents — « Bordeaux »
// devenait Amiens dans un bloc et Carcassonne dans l'autre, et « ces deux adresses
// sont-elles dans la même région ? » basculait de oui à non. Deux causes : `fakeGeo` choisit
// son lieu par hachage de la VALEUR ENTIÈRE (deux rues différentes à Bordeaux hachent
// différemment), et `resolveGeoBlocks` imposait l'unicité des faux entre blocs même pour la
// MÊME valeur réelle.
//
// Ce module tient la table `ville réelle → lieu faux` d'un appel, semée depuis le COFFRE
// pour tenir aussi d'un envoi à l'autre. La règle de réversibilité est RAFFINÉE, jamais
// affaiblie : deux villes réelles distinctes gardent deux faux distincts (`usedCities`
// l'interdit dans les deux sens) ; seule la même ville réelle partage son faux.
//
// Aucune importation depuis `./index` (qui nous importe) : le pool et le re-tirage arrivent
// en paramètres. État EXPLICITE par appel de `pseudonymize`, jamais au niveau du module —
// deux conversations ne partagent rien.
import type { GeoPlace, ISO2 } from "./types";

export interface GeoAnchors {
  /** `"FR|bordeaux"` → le lieu faux servi pour cette ville réelle. */
  byCity: Map<string, GeoPlace>;
  /** `cityLower` du FAUX → clé réelle servie — l'anti-collision dans l'autre sens. */
  usedCities: Map<string, string>;
}

export function createGeoAnchors(): GeoAnchors {
  return { byCity: new Map(), usedCities: new Map() };
}

const keyOf = (c: ISO2, city: string): string => `${c}|${city.trim().toLowerCase()}`;

/** Relances pendant lesquelles l'ancre tient bon avant de céder à l'anti-collision. */
const HOLD = 8;

/**
 * Le lieu pour `realCity` : l'ancre si elle existe, sinon `fallback` — re-tiré via
 * `repick(i)` tant que sa ville sert déjà une AUTRE ville réelle — puis mémorisé.
 * Sans `anchors` (appel hors conversation, tests unitaires du faux seul) : `fallback` tel
 * quel, comportement d'avant.
 *
 * ⚠️ `attempt` est la moitié qui rend l'ancre COMPATIBLE avec l'allocateur. La première
 * version enregistrait au tirage et rendait toujours l'ancre : un candidat refusé en amont
 * (`avoid` — le faux égalait un mot déjà tapé dans la conversation) revenait donc à
 * l'IDENTIQUE à chaque relance, épuisait les 60 essais, et le repli « best-effort » ignorait
 * `avoid` : le root-fix des collisions de conversation était défait. À `attempt > 0`,
 * l'ancre AVANCE (et est ré-enregistrée) au lieu d'être rendue telle quelle — la cohérence
 * cède le pas à l'anti-collision, jamais l'inverse.
 */
export function anchorPlace(
  anchors: GeoAnchors | undefined,
  c: ISO2,
  realCity: string | undefined,
  fallback: GeoPlace,
  repick?: (i: number) => GeoPlace,
  attempt = 0,
): GeoPlace {
  if (!anchors || !realCity?.trim()) return fallback;
  const key = keyOf(c, realCity);
  const hit = anchors.byCity.get(key);
  // L'ancre TIENT pendant les premières tentatives : la rue, elle, varie déjà avec `h`,
  // donc un rejet de candidat (mot de rue en collision) se résout SANS bouger la ville.
  // Elle ne cède qu'après HOLD relances — le cas où c'est la ville MÊME qui est refusée
  // (un faux égal à un mot de la conversation, le root-fix `avoid`).
  if (hit && attempt < HOLD) return hit;
  let place = attempt > 0 && repick ? repick(attempt * 41) : fallback;
  if (repick) {
    for (let i = 1; i <= 40; i++) {
      const owner = anchors.usedCities.get(place.city.toLowerCase());
      const movedOff = hit === undefined || place.city !== hit.city || i > 1;
      if ((owner === undefined || owner === key) && (attempt === 0 || movedOff)) break;
      place = repick(attempt * 41 + i);
    }
  }
  if (hit && anchors.usedCities.get(hit.city.toLowerCase()) === key)
    anchors.usedCities.delete(hit.city.toLowerCase());
  anchors.byCity.set(key, place);
  anchors.usedCities.set(place.city.toLowerCase(), key);
  return place;
}

/** La ville « lâche » d'une valeur du coffre, pour le SEMIS uniquement : la queue après un
 *  code postal (« …, 33000 Bordeaux », CEDEX retiré), ou la valeur entière si elle est un
 *  nom nu (sans chiffre, ≤ 3 mots). Prudente exprès — un raté ne coûte que l'absence
 *  d'ancre (le statu quo), jamais une substitution fausse. */
export function extractCityLoose(value: string): string | null {
  const v = value.replace(/\bCEDEX\b\s*\d*\s*$/iu, "").trim();
  const tail = v.match(/\b\d{4,5}\s+(\p{L}[\p{L}\s'’-]{1,40})$/u)?.[1];
  if (tail) return tail.trim();
  if (!/\d/.test(v) && v.split(/\s+/).length <= 3 && /^\p{L}/u.test(v)) return v;
  return null;
}

/**
 * Sème les ancres depuis le COFFRE, pour que la cohérence tienne d'un envoi à l'autre.
 * Une entrée n'est retenue que si son côté FAUX nomme une ville du pool (c'est la preuve
 * qu'elle est géographique — un faux nom de personne n'y correspond jamais) et si son côté
 * réel livre une ville extractible.
 */
export function seedGeoAnchors(
  anchors: GeoAnchors,
  vault: Record<string, string>,
  pools: Partial<Record<ISO2, GeoPlace[]>>,
): void {
  const byFakeCity = new Map<string, { c: ISO2; place: GeoPlace }>();
  for (const [c, pool] of Object.entries(pools) as [ISO2, GeoPlace[]][]) {
    for (const p of pool ?? []) byFakeCity.set(p.city.toLowerCase(), { c, place: p });
  }
  for (const [fake, real] of Object.entries(vault)) {
    const fakeCity = extractCityLoose(fake)?.toLowerCase();
    if (!fakeCity) continue;
    const entry = byFakeCity.get(fakeCity);
    if (!entry) continue;
    const realCity = extractCityLoose(real);
    if (!realCity) continue;
    const key = keyOf(entry.c, realCity);
    if (anchors.byCity.has(key) || anchors.usedCities.has(fakeCity)) continue;
    anchors.byCity.set(key, entry.place);
    anchors.usedCities.set(fakeCity, key);
  }
}
