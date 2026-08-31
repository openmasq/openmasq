// CITY ANCHORING — a real city gets ONE fake place, everywhere.
//
// The measured bug (`bench/tokensVsFakes.md`, the most costly on the bench): the same city
// written in two separate addresses got two different fake places — « Bordeaux »
// became Amiens in one block and Carcassonne in the other, and « are these two addresses
// in the same region? » flipped from yes to no. Two causes: `fakeGeo` picks
// its place by hashing the WHOLE VALUE (two different streets in Bordeaux hash
// differently), and `resolveGeoBlocks` was enforcing fake uniqueness across blocks even for
// the SAME real value.
//
// This module keeps the `real city → fake place` table for one call, seeded from the VAULT
// so it also holds across separate sends. The reversibility rule is REFINED, never
// weakened: two distinct real cities keep two distinct fakes (`usedCities`
// forbids it both ways); only the same real city shares its fake.
//
// No import from `./index` (which imports us): the pool and the re-draw arrive
// as parameters. EXPLICIT state per `pseudonymize` call, never at the module level —
// two conversations share nothing.
import type { GeoPlace, ISO2 } from "./types";

export interface GeoAnchors {
  /** `"FR|bordeaux"` → the fake place served for this real city. */
  byCity: Map<string, GeoPlace>;
  /** `cityLower` of the FAKE → real key served — the anti-collision in the other direction. */
  usedCities: Map<string, string>;
}

export function createGeoAnchors(): GeoAnchors {
  return { byCity: new Map(), usedCities: new Map() };
}

const keyOf = (c: ISO2, city: string): string => `${c}|${city.trim().toLowerCase()}`;

/** Retries during which the anchor holds firm before giving way to anti-collision. */
const HOLD = 8;

/**
 * The place for `realCity`: the anchor if it exists, else `fallback` — re-drawn via
 * `repick(i)` as long as its city already serves ANOTHER real city — then remembered.
 * Without `anchors` (a call outside a conversation, the fake's own unit tests): `fallback`
 * as-is, same as before.
 *
 * ⚠️ `attempt` is the half that makes the anchor COMPATIBLE with the allocator. The first
 * version recorded on the draw and always returned the anchor: a candidate rejected upstream
 * (`avoid` — the fake equaled a word already typed in the conversation) therefore came back
 * IDENTICAL on every retry, exhausted the 60 attempts, and the "best-effort" fallback ignored
 * `avoid`: the root-fix for conversation collisions was undone. At `attempt > 0`,
 * the anchor MOVES ON (and is re-recorded) instead of being returned as-is — coherence
 * gives way to anti-collision, never the reverse.
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
  // The anchor HOLDS during the first attempts: the street, itself, already varies with `h`,
  // so a candidate rejection (a colliding street word) resolves WITHOUT moving the city.
  // It only gives way after HOLD retries — the case where it's the city ITSELF that's rejected
  // (a fake equal to a word from the conversation, the `avoid` root-fix).
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

/** The "loose" city of a vault value, for SEEDING only: the tail after a
 *  postal code (« …, 33000 Bordeaux », CEDEX stripped), or the whole value if it's a
 *  bare name (no digit, ≤ 3 words). Deliberately cautious — a miss only costs the absence
 *  of an anchor (the status quo), never a wrong substitution. */
export function extractCityLoose(value: string): string | null {
  const v = value.replace(/\bCEDEX\b\s*\d*\s*$/iu, "").trim();
  const tail = v.match(/\b\d{4,5}\s+(\p{L}[\p{L}\s'’-]{1,40})$/u)?.[1];
  if (tail) return tail.trim();
  if (!/\d/.test(v) && v.split(/\s+/).length <= 3 && /^\p{L}/u.test(v)) return v;
  return null;
}

/**
 * Seeds the anchors from the VAULT, so coherence holds across separate sends.
 * An entry is only kept if its FAKE side names a city from the pool (that's the proof
 * it's geographic — a fake person's name never matches it) and if its
 * real side yields an extractable city.
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
