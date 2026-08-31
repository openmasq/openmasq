// Multi-country coherent fake places. A redacted address / place / postal code is
// swapped for a REAL place of the SAME country, in that country's own address FORMAT
// — so a German address stays German ("Straße num, PLZ Stadt"), a US one stays
// "num Street, City ST zip", a French one stays "num rue …, CP Ville" but in a
// DIFFERENT region (via frGeo) so the real region isn't disclosed. A country we have
// no table for → the caller keeps the
// value's shape and NEVER borrows a wrong-country place. Pure data + string ops;
// every fake is a verbatim swap, reversible via the vault.
import { regionOfCp, departmentOfCp, matchCase } from "../frGeo";
import type { AddressFormatter, GeoPlace, ISO2 } from "./types";
import { FR_PLACES } from "./places.fr";
import { EU_PLACES } from "./places.eu";
import { NA_PLACES } from "./places.na";
import { ASIA_PLACES } from "./places.asia";
import { isNotoriousPlace } from "./notorious";
import { isCountry, fakeCountry } from "./countries";
import { STREETS } from "./streets";
import { anchorPlace, type GeoAnchors } from "./cityAnchor";
export type { GeoAnchors } from "./cityAnchor";

/** Categories a detector emits for « some place », with no shape commitment — the ones a
 *  street can hide behind. `ADDRESS` is excluded: it already routes correctly. */
const GENERIC_PLACE: ReadonlySet<string> = new Set(["LOCATION", "PLACE", "GPE", "LOC"]);
/**
 * A value that OPENS with a street-type word (optionally after its house number):
 * « rue Villa Ancelle », « 31 rue Villa Ancelle », « avenue des Ternes ».
 *
 * ⚠️ Anchored at the START on purpose, and with no short abbreviation. A first attempt
 * matched a street word ANYWHERE and included `st`/`av`/`bd`/`villa` — « ST OUEN (93400) »
 * was then read as a street and faked into « 96 IMPASSE DE LA FONTAINE, 29000 Quimper »,
 * breaking the very town the sibling fix had just taught to come back. A missed street is
 * a clumsy fake; a town read as a street is a wrong one.
 */
const STREET_HEAD =
  /^\s*(?:\d{1,4}\s*(?:bis|ter|[a-d])?[\s,]+)?(?:rue|avenue|boulevard|chemin|impasse|all[ée]e|place|cours|quai|route|square|passage|sentier|voie|street|road|lane|drive|strasse|stra\u00dfe|calle|avenida|via|viale|corso|rua)(?:[\s,.]|$)/iu;

export * from "./types";
export { FR_PLACES } from "./places.fr";

/** ISO2 → real places (city + real postal + admin region). FR keyed explicitly so
 *  the region-aware FR path (frGeo) can find it; the rest spread from their region. */
export const PLACES_BY_COUNTRY: Record<ISO2, GeoPlace[]> = {
  FR: FR_PLACES,
  ...EU_PLACES,
  ...NA_PLACES,
  ...ASIA_PLACES,
};

/** Fake street vocabulary (combinatorial, per language) — data lives in ./streets.ts. */
/** Which street language each country writes in. */
const COUNTRY_LANG: Record<ISO2, keyof typeof STREETS> = {
  FR: "fr", BE: "fr", CH: "fr", LU: "fr",
  US: "en", GB: "en", CA: "en", IE: "en",
  DE: "de", AT: "de", ES: "es", IT: "it", NL: "nl", PT: "pt",
};
function streets(country: ISO2): string[] {
  return STREETS[COUNTRY_LANG[country] ?? "en"] ?? STREETS.en;
}

/** Address-line layout per country (default = French "num street, POSTAL City"). */
export const FORMATTERS: Record<ISO2, AddressFormatter> = {
  FR: (n, s, p) => `${n} ${s}, ${p.postal} ${p.city}`,
  LU: (n, s, p) => `${n} ${s}, ${p.postal} ${p.city}`,
  BE: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  CH: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  DE: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  AT: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  ES: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  IT: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  NL: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  PT: (n, s, p) => `${s} ${n}, ${p.postal} ${p.city}`,
  US: (n, s, p) => `${n} ${s}, ${p.city}, ${p.region} ${p.postal}`,
  CA: (n, s, p) => `${n} ${s}, ${p.city}, ${p.region} ${p.postal}`,
  GB: (n, s, p) => `${n} ${s}, ${p.city} ${p.postal}`,
  IE: (n, s, p) => `${n} ${s}, ${p.city}, ${p.postal}`,
};
const DEFAULT_FMT: AddressFormatter = FORMATTERS.FR;

/** Countries whose street line puts the NUMBER AFTER the street name (so a street-only
 *  fake reads "Straße 12", not "12 Straße"). Everyone else is number-first. */
const NUM_AFTER = new Set<ISO2>(["BE", "CH", "DE", "AT", "ES", "IT", "NL", "PT"]);

/** A postal code inside a value (distinctive foreign shapes first, then FR/EU digits). */
const POSTAL_IN = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|[A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{4}\s?[A-Z]{2}|\d{4}-\d{3}|\d{5}|\d{4})\b/;
function extractPostal(value: string): string | undefined {
  return value.match(POSTAL_IN)?.[1];
}

/** Guess a country from a POSTAL shape — distinctive shapes only. A bare 5-digit is
 *  ambiguous (FR/DE/ES/IT/US) → undefined, left to the detector's country hint. */
export function guessCountryFromPostal(postal?: string): ISO2 | undefined {
  if (!postal) return undefined;
  const p = postal.trim();
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(p)) return "GB";
  if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(p)) return "CA";
  if (/^\d{4}\s?[A-Z]{2}$/i.test(p)) return "NL";
  if (/^\d{4}-\d{3}$/.test(p)) return "PT";
  return undefined;
}

/** Guess a country from DISTINCTIVE street keywords in the value — the fallback when
 *  the detector didn't tag a country (e.g. a labeled "Anschrift: …/Dirección: …"
 *  field, which loses the address SHAPE). Shared FR/EN words (avenue/boulevard) are
 *  deliberately NOT here, so an untagged FR "avenue X" still defaults to FR. */
function guessCountryFromText(v: string): ISO2 | undefined {
  const lv = v.toLowerCase();
  if (/(?:^|\W)(calle|avenida|avda|paseo|plaza|camino|carretera)(?:\W|$)/.test(lv)) return "ES";
  if (/(?:^|\W)(via|viale|corso|piazza|vicolo|largo|strada)(?:\W|$)/.test(lv)) return "IT";
  if (/(?:^|\W)(rua|travessa|pra[çc]a)(?:\W|$)/.test(lv)) return "PT";
  if (/straat|laan|plein/i.test(v)) return "NL";
  if (/stra(?:ße|sse)|\w{2,}platz|\wweg\b|\wgasse\b|\ballee\b/i.test(v)) return "DE";
  if (/(?:^|\W)(street|road|lane|drive|blvd|court)(?:\W|$)/.test(lv)) return "GB";
  return undefined;
}

/** Resolve the country for a geo fake. Explicit-but-uncovered → null (caller keeps
 *  the shape, never a wrong-country place). Unknown → guess from the postal shape,
 *  then the street keyword; else FR (legacy default). */
export function resolveCountry(value: string, country?: string): ISO2 | null {
  if (country) return PLACES_BY_COUNTRY[country] ? country : null;
  const g = guessCountryFromPostal(extractPostal(value)) ?? guessCountryFromText(value);
  if (g) return PLACES_BY_COUNTRY[g] ? g : null;
  // A CJK value with no country/guess keeps its SHAPE — never the FR default (which would
  // fake a Chinese/Korean city to a French one). Covered CJK blocks reach the coherent
  // faker via the country hint from `geoBlocks`/`detectCjkGeo` instead.
  if (/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u.test(value)) return null;
  return "FR";
}

/** Pick a real place of `country`, avoiding the user's own. For FR, pick one in a
 *  DIFFERENT region than the original, so the fake doesn't disclose the real region
 *  (a Breton address must NOT stay Breton). Deterministic on `h`. */
export function pickPlaceForCountry(country: ISO2, h: number, realPostal?: string, realCity?: string): GeoPlace {
  const pool = PLACES_BY_COUNTRY[country] ?? FR_PLACES;
  const differs = (p: GeoPlace) =>
    (!realPostal || p.postal !== realPostal) &&
    (!realCity || p.city.toLowerCase() !== realCity.toLowerCase());
  const region = country === "FR" && realPostal ? regionOfCp(realPostal) : undefined;
  const otherRegion = region ? pool.filter((p) => p.region !== region && differs(p)) : [];
  const base = otherRegion.length ? otherRegion : pool.filter(differs);
  // Prefer an OBSCURE place — one the user is unlikely to retype, so the fake can't
  // collide with a legitimately-typed place later in the conversation. Fall back to
  // the famous ones only if excluding them would leave nothing.
  const obscure = base.filter((p) => !isNotoriousPlace(p.city));
  const use = obscure.length ? obscure : base;
  const arr = use.length ? use : pool;
  return arr[h % arr.length];
}

const shapeOf = (s: string) => s.replace(/\p{L}/gu, "A").replace(/\d/g, "9");

/**
 * The country-consistent fake for a geographic span. Returns null when the country
 * isn't covered (the caller then keeps the value's own shape) so a fake is NEVER a
 * place from the wrong country.
 */
export function fakeGeo(category: string, value: string, h: number, country?: string,
  anchors?: GeoAnchors, attempt = 0): string | null {
  // City vs COUNTRY: the NER tags a bare country ("France") as a generic LOCATION,
  // which would otherwise be faked to a CITY. A country must stay a country — swap it
  // for a different country in the same language, never a city.
  if (
    (category === "LOCATION" || category === "CITY" || category === "TOWN") &&
    isCountry(value)
  ) {
    return fakeCountry(value, h);
  }
  const c = resolveCountry(value, country);
  if (!c) return null;
  const realPostal = extractPostal(value);
  // A generic LOCATION that is actually a STREET must be faked as a street, not as a
  // town. Measured on a notary's attestation: the NER tagged « rue \n Villa Ancelle » as a
  // LOCATION, the branch below had no case for it, and the caller's fallback minted a
  // CITY — the model read « un bien sis à LORIENT (56100) 31 avignon », an address that
  // means nothing. The ADDRESS branch already produces a correct street-only fake; this
  // only routes the value to it.
  const cat = STREET_HEAD.test(value) && GENERIC_PLACE.has(category) ? "ADDRESS" : category;
  switch (cat) {
    case "ADDRESS": {
      const st = streets(c);
      // Same ORDER OF MAGNITUDE as the original house number («225 avenue…» faked to a
      // 3-digit number, not «33») — the number itself still moves.
      const realNum = value.match(/(?:^|\s)(\d{1,4})(?:\s|$)/u)?.[1];
      const num =
        realNum && realNum.length > 1
          ? 10 ** (Math.min(realNum.length, 3) - 1) + (h % (9 * 10 ** (Math.min(realNum.length, 3) - 1) - 2))
          : 1 + (h % 98);
      // …and a street with NO house number keeps none: inventing one adds a detail the
      // document never carried, which a model then reasons about as if it were real.
      const numless = !/\d/.test(value);
      const street = st[h % st.length];
      // A STREET-ONLY input must stay street-only. The FORMATTERS always append a
      // "postal + city", so a bare "75 rue de paris" was faked to "72 avenue victor hugo,
      // 66000 Perpignan" — INVENTING a city/postal that (a) wasn't in the field and (b)
      // conflicts with a SEPARATE "Commune"/"Ville" field faked elsewhere → the reported
      // "several fake addresses for ONE real address". Keep a place tail ONLY when the
      // original carried one: a postal code (`realPostal` — the FR/EU "CP Ville" or US
      // ZIP) OR a trailing city right after the house number (the "street num CITY" order
      // of DE/NL/ES/IT: "Marienplatz 8 München"). "75 rue de paris (15)" has neither.
      const hasPlace =
        realPostal !== undefined || /\d\s+\p{Lu}[\p{L}'’.-]*\s*$/u.test(value);
      // The fake WEARS the original's dress, or the substitution is visible at a glance
      // (the SACEM-statement report): the STREET segment mirrors the original street's
      // casing (« 36 AV DU CAPITAINE GLARNER » must not become lowercase « rue des
      // Lilas »), the street↔postal SEPARATOR is reused (« … - 92528 » keeps its dash
      // instead of the formatter's comma), the CITY mirrors the original city's casing,
      // and a trailing CEDEX (+ its office number) is carried over verbatim.
      const postalIdx = realPostal !== undefined ? value.indexOf(realPostal) : -1;
      const origTail = postalIdx > 0 ? value.slice(postalIdx + realPostal!.length) : "";
      const origCity = origTail.replace(/\bCEDEX\b\s*\d*\s*$/iu, "").trim();
      const origStreet = (postalIdx > 0 ? value.slice(0, postalIdx) : value)
        .replace(/[\s,–—-]+$/u, "");
      const streetLine = matchCase(
        numless ? street : NUM_AFTER.has(c) ? `${street} ${num}` : `${num} ${street}`,
        origStreet,
      );
      if (!hasPlace) return streetLine;
      // Anchored on the REAL city: a second address in the same city gets the
      // same fake city — « same region? » no longer flips (bench/tokensVsFakes.md).
      const place = anchorPlace(anchors, c, origCity, pickPlaceForCountry(c, h, realPostal),
        (i) => pickPlaceForCountry(c, h + i * 7, realPostal), attempt);
      const out = (FORMATTERS[c] ?? DEFAULT_FMT)(num, street, place);
      // FR-like "street, POSTAL City" layouts are recomposed piecewise; the other
      // country formats keep their native layout and only mirror an ALL-CAPS original.
      if (out.startsWith(`${num} ${street}, ${place.postal} `)) {
        const sep = (postalIdx > 0 && /[-–—]\s*$/u.test(value.slice(0, postalIdx))
          ? value.slice(0, postalIdx).match(/\s*[-–—]\s*$/u)![0]
          : ", ");
        const cedex = origTail.match(/\bCEDEX\b\s*\d*\s*$/iu)?.[0].trim();
        const city = matchCase(place.city, origCity || value);
        return `${streetLine}${sep}${place.postal} ${city}${cedex ? ` ${cedex}` : ""}`;
      }
      return matchCase(out, value);
    }
    case "PLACE": {
      // The NOTARIAL order first — "Ville (CP)" / "Ville (Département CP" (OCR may
      // drop the close paren): keep the parenthesised LAYOUT, swap the substance for
      // ONE coherent real place (city + ITS postal; the department, when present,
      // becomes the fake postal's own department). The default "CP Ville" formatter
      // below would reorder the field and read wrong in the deed.
      const parens = value.match(/^(.*?)\s*\(\s*(?:(\p{Lu}[^)\d]*?)\s+)?(\d{5})\s*(\)?)$/u);
      if (parens) {
        const [, cityPart = "", deptPart, , close] = parens;
        const place = anchorPlace(anchors, c, cityPart, pickPlaceForCountry(c, h, realPostal, cityPart),
          (i) => pickPlaceForCountry(c, h + i * 7, realPostal, cityPart), attempt);
        const dept = deptPart ? `${matchCase(departmentOfCp(place.postal) ?? place.region, deptPart)} ` : "";
        return `${matchCase(place.city, cityPart)} (${dept}${place.postal}${close}`;
      }
      // FR "CP Ville" (the code + its city, captured as one unit): a coherent
      // same-country place, city casing preserved — and a trailing CEDEX (+ office
      // number) carried over verbatim, exactly like the ADDRESS path above.
      const cedexTail = value.match(/\bCEDEX\b\s*\d*\s*$/iu)?.[0].trim();
      const cityTok = value
        .replace(/\bCEDEX\b\s*\d*\s*$/iu, "")
        .replace(POSTAL_IN, "")
        .replace(/[\s,;.-]+$/u, "")
        .trim();
      const place = anchorPlace(anchors, c, cityTok || undefined,
        pickPlaceForCountry(c, h, realPostal, cityTok || undefined),
        (i) => pickPlaceForCountry(c, h + i * 7, realPostal, cityTok || undefined), attempt);
      return `${place.postal} ${matchCase(place.city, cityTok || place.city)}${cedexTail ? ` ${cedexTail}` : ""}`;
    }
    case "LOCATION":
    case "CITY":
    case "TOWN": {
      // Prefer a same-LENGTH real city of the country (keeps layout / leaks no size),
      // else any other different one.
      const pool = PLACES_BY_COUNTRY[c] ?? FR_PLACES;
      const sameLen = pool.filter(
        (p) => p.city.length === value.length && p.city.toLowerCase() !== value.toLowerCase(),
      );
      // Prefer an obscure same-length city (no vault collision on retype); fall back
      // to any same-length one, then to the region-aware picker (also obscure-first).
      const sameLenObscure = sameLen.filter((p) => !isNotoriousPlace(p.city));
      const pick = sameLenObscure.length ? sameLenObscure : sameLen;
      const place = anchorPlace(anchors, c, value,
        pick.length ? pick[h % pick.length] : pickPlaceForCountry(c, h, undefined, value),
        (i) => (pick.length ? pick[(h + i) % pick.length] : pickPlaceForCountry(c, h + i * 7, undefined, value)), attempt);
      return matchCase(place.city, value);
    }
    case "POSTAL_CODE":
    case "POSTCODE":
    case "ZIP":
    case "ZIPCODE": {
      const place = pickPlaceForCountry(c, h, realPostal);
      // Only swap when the real place's code has the SAME shape (else the caller
      // same-shape-scrambles so nothing leaks and layout holds).
      return shapeOf(place.postal) === shapeOf(value.trim()) ? place.postal : null;
    }
    default:
      return null;
  }
}
