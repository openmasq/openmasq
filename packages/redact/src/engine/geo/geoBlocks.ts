// Cross-field GEO COHERENCE for an address block.
//
// On a form (a cadastral record, a US "City / State / Zip" block…) the geo fields of ONE
// real location are detected and faked INDEPENDENTLY → a fake commune "38000 Grenoble" (in
// the Isère) next to a fake department "Essonne", or a fake city "Austin" next to a fake
// state "NY". This module GROUPS the geo fields that sit close together (an address block is
// a few adjacent lines) and derives them all from ONE coherent real place {city, postal,
// admin unit} — so the fake city's postal and its "Département"/"State" name the SAME place.
//
// Reversibility: each field keeps its OWN `fake → real` vault entry, and the per-block place
// is UNIQUE across blocks so no two real values ever map to the same fake. Determinism: the
// place is a stable hash of the block. Country-aware: the block's country comes from a field
// carrying it (the admin field: `frGeo`→FR, `usGeo`→US), default FR; the place is drawn from
// `PLACES_BY_COUNTRY[country]` — an uncovered country (CN/KR today) is skipped (independent
// faker, no fake place). Pattern-detected fields only (they carry a `start`); the NER's prose
// geo has no block. The ADDRESS field keeps its own street faker.
import type { Detection } from "../../types";
import { PLACES_BY_COUNTRY } from "./index";
import type { GeoPlace, ISO2 } from "./types";
import { departmentOfCp, matchCase } from "../frGeo";
import { extractCityLoose, type GeoAnchors } from "./cityAnchor";
import { usStateName, isUsStateFullName } from "./usStates";

/** Non-ADDRESS geo categories whose fake must be coherent within a block. */
const BLOCK_CATS = new Set(["PLACE", "CITY", "LOCATION", "TOWN", "POSTAL_CODE", "DEPARTMENT", "REGION"]);
const ADMIN_CATS = new Set(["DEPARTMENT", "REGION"]);

/** Max character gap between two fields still considered the SAME block (~3 form lines). */
const BLOCK_GAP = 200;

/** Deterministic FNV-1a hash (no Math.random — reproducible across turns/devices). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type GeoCand = Detection & { start: number };

/** The block's country: the admin field's country wins (it anchors FR vs US), else any
 *  field's country, else inferred from the values' SCRIPT (a CJK block must NOT default to
 *  FR — that would fake a Chinese city to a French one): Hangul → KR, Han → CN (JP has JP
 *  prefecture markers 県/都/府 and no place table → left uncovered), else FR (legacy default;
 *  a bare 5-digit postal is FR/US-ambiguous — the State field is the disambiguator). */
function blockCountry(block: GeoCand[]): ISO2 {
  const admin = block.find((g) => ADMIN_CATS.has(g.category.toUpperCase()) && g.country);
  const tagged = admin?.country ?? block.find((g) => g.country)?.country;
  if (tagged) return tagged as ISO2;
  const joined = block.map((g) => g.value).join("");
  if (/[\p{sc=Hangul}]/u.test(joined)) return "KR";
  if (/[\p{sc=Han}]/u.test(joined)) return (/[県都府]/u.test(joined) ? "JP" : "CN") as ISO2;
  return "FR";
}

/** The coherent fake for one field, from the block place, recased to the original. */
function fieldFake(cat: string, value: string, place: GeoPlace, country: ISO2): string | null {
  const cased = (s: string) => matchCase(s, value);
  switch (cat) {
    case "CITY":
    case "LOCATION":
    case "TOWN":
      return cased(place.city);
    case "PLACE":
      return `${place.postal} ${cased(place.city)}`;
    case "POSTAL_CODE":
      return place.postal;
    case "REGION":
      // US: `place.region` is the 2-letter code; keep the original's FORM (full name vs code).
      if (country === "US")
        return cased(isUsStateFullName(value) ? usStateName(place.region) ?? place.region : place.region);
      return cased(place.region); // FR région (or another covered country's region)
    case "DEPARTMENT": {
      const dept = departmentOfCp(place.postal); // FR concept
      return dept ? cased(dept) : null;
    }
    default:
      return null;
  }
}

/**
 * Resolve coherent fakes for the geo fields of each address block.
 * @returns `Map<realValue, fakeValue>` — a precomputed fake for the block-grouped geo
 *   values; `pseudonymize` uses it in place of the independent `fakeGeo`. Empty when there's
 *   no multi-field covered block. `taken` = fakes already issued (avoided for collision-safety).
 */
/** The categories whose value NAMES the block's city — what the anchor rests on. */
const CITYISH = new Set(["CITY", "TOWN", "LOCATION", "PLACE"]);

/** The real city that a block field names, if it names one. */
function blockCity(g: GeoCand): string | null {
  const cat = g.category.toUpperCase();
  if (!CITYISH.has(cat)) return null;
  return cat === "PLACE" ? extractCityLoose(g.value) : g.value.trim() || null;
}

export function resolveGeoBlocks(
  candidates: Detection[],
  taken: Set<string>,
  opts?: { anchors?: GeoAnchors; vault?: Record<string, string> },
): Map<string, string> {
  const geo = candidates
    .filter((c): c is GeoCand => c.start !== undefined && BLOCK_CATS.has(c.category.toUpperCase()))
    .sort((a, b) => a.start - b.start);
  const out = new Map<string, string>();
  if (geo.length < 2) return out;

  // Group by proximity: a new block starts when the gap to the previous span exceeds BLOCK_GAP.
  const blocks: GeoCand[][] = [];
  let cur: GeoCand[] = [];
  let prevEnd = -Infinity;
  for (const g of geo) {
    if (cur.length && g.start - prevEnd > BLOCK_GAP) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(g);
    prevEnd = g.start + g.value.length;
  }
  if (cur.length) blocks.push(cur);

  // Each emitted fake → the real value it serves. Cross-block uniqueness protects
  // reversibility (two distinct REAL values never share a fake) — but the SAME real
  // value MUST be able to reuse its fake: this was the most costly measured defect on
  // the bench (`bench/tokensVsFakes.md`) — « 33000 Bordeaux » in two blocks became Amiens
  // then Carcassonne, and « same region? » flipped from yes to no. Same rule for `taken`:
  // a fake already in the vault is reusable when it serves THE SAME real value.
  const usedFakes = new Map<string, string>(); // fakeLower → realLower
  const vaultReal = new Map<string, string>(); // fakeLower → realLower (le coffre)
  for (const [fk, rl] of Object.entries(opts?.vault ?? {})) vaultReal.set(fk.toLowerCase(), rl.toLowerCase());
  const reusable = (fake: string, real: string): boolean => {
    const f = fake.toLowerCase(), r = real.toLowerCase();
    const used = usedFakes.get(f);
    if (used !== undefined && used !== r) return false;
    if (taken.has(fake) && vaultReal.get(f) !== r) return false;
    return true;
  };
  for (const rawBlock of blocks) {
    // The SAME value can be detected twice (a Commune caught by BOTH the labeled-field and
    // the address PLACE detector). Dedup by value — else the second copy yields the same
    // fake and the all-or-nothing loop below rejects every place on the duplicate check.
    const seenVal = new Set<string>();
    const block = rawBlock.filter((g) => (seenVal.has(g.value) ? false : (seenVal.add(g.value), true)));
    if (block.length < 2) continue; // a lone geo field keeps the independent faker
    const country = blockCountry(block);
    const pool = PLACES_BY_COUNTRY[country];
    if (!pool || !pool.length) continue; // uncovered country (CN/KR today) → independent faker
    const seed = hash(block.map((g) => g.value).join("|"));
    // The ANCHOR first: if a block's city already has its place (another block, another
    // address, or the vault of a previous send), try it before drawing — same place everywhere.
    const anchored = opts?.anchors
      ? block.map(blockCity).filter((c): c is string => !!c)
          .map((c) => opts.anchors!.byCity.get(`${country}|${c.toLowerCase()}`))
          .find((pl) => pl !== undefined)
      : undefined;
    // Try places until ONE yields a VALID fake for EVERY field: each fake must differ from
    // its own real value (so the fake department/state isn't the real one — the bug where
    // a same-department place was picked), be unique across blocks, and not clash with a
    // prior fake / the block itself. All-or-nothing per place ⇒ the whole block stays
    // coherent (one place) or falls back to the independent faker.
    for (let i = anchored ? -1 : 0; i < pool.length; i++) {
      const place = i === -1 ? anchored! : pool[(seed + i) % pool.length];
      const assign: { value: string; fake: string }[] = [];
      let ok = true;
      for (const g of block) {
        const fake = fieldFake(g.category.toUpperCase(), g.value, place, country);
        if (
          !fake ||
          fake.toLowerCase() === g.value.toLowerCase() ||
          !reusable(fake, g.value) ||
          assign.some((a) => a.fake === fake && a.value !== g.value)
        ) {
          ok = false;
          break;
        }
        assign.push({ value: g.value, fake });
      }
      if (!ok) continue;
      for (const a of assign)
        if (!out.has(a.value)) {
          out.set(a.value, a.fake);
          usedFakes.set(a.fake.toLowerCase(), a.value.toLowerCase());
        }
      // The chosen place becomes the anchor for every city the block names — standalone
      // addresses (fakeGeo) and later blocks will reuse it.
      if (opts?.anchors) {
        for (const g of block) {
          const cityName = blockCity(g);
          if (!cityName) continue;
          const key = `${country}|${cityName.toLowerCase()}`;
          if (!opts.anchors.byCity.has(key)) {
            opts.anchors.byCity.set(key, place);
            opts.anchors.usedCities.set(place.city.toLowerCase(), key);
          }
        }
      }
      break;
    }
  }
  return out;
}
