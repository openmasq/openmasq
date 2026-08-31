// City vs COUNTRY differentiation for geo fakes. The NER tags every place as a
// generic LOCATION, so a bare COUNTRY typed in prose ("actualités en France") used
// to be faked to a CITY (France → "Troyes") — the mirror of the city → country bug
// the obscure-place pool already fixes. A country must stay a country: `isCountry`
// recognises the value, `fakeCountry` swaps it for a DIFFERENT country in the SAME
// display language (FR "Allemagne" → "Belgique", EN "Germany" → "Spain").
//
// Pure data + string ops; the swap is verbatim, reversible via the vault.
import { matchCase } from "../frGeo";

const strip = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// The common country names a user actually types, grouped by display LANGUAGE so a
// fake stays in the input's language. Same-in-both spellings (France/Portugal/Canada/
// Luxembourg/Monaco) live in the FR list and default to FR (the app is FR-first).
const FR_COUNTRIES = [
  "France", "Belgique", "Suisse", "Allemagne", "Espagne", "Italie", "Portugal",
  "Angleterre", "Royaume-Uni", "Écosse", "Irlande", "Luxembourg", "Pays-Bas",
  "Autriche", "Grèce", "Suède", "Norvège", "Finlande", "Danemark", "Pologne",
  "Hongrie", "Roumanie", "Croatie", "Turquie", "Russie", "Ukraine", "Maroc",
  "Tunisie", "Algérie", "Sénégal", "Côte d'Ivoire", "Cameroun", "Égypte",
  "Canada", "Mexique", "Brésil", "Argentine", "Chili", "Colombie", "Pérou",
  "Japon", "Chine", "Corée", "Inde", "Thaïlande", "Vietnam", "Indonésie",
  "Australie", "Monaco", "Islande",
];
const EN_COUNTRIES = [
  "France", "Belgium", "Switzerland", "Germany", "Spain", "Italy", "Portugal",
  "England", "Scotland", "Ireland", "Luxembourg", "Netherlands", "Austria",
  "Greece", "Sweden", "Norway", "Finland", "Denmark", "Poland", "Hungary",
  "Romania", "Croatia", "Turkey", "Russia", "Ukraine", "Morocco", "Tunisia",
  "Algeria", "Senegal", "Egypt", "Canada", "Mexico", "Brazil", "Argentina",
  "Chile", "Colombia", "Peru", "Japan", "China", "Korea", "India", "Thailand",
  "Vietnam", "Indonesia", "Australia", "Monaco", "Iceland",
];
// Native / other spellings we RECOGNISE as countries (so they're not faked to a city)
// but never emit as a fake.
//
// ⚠️ The UNITED KINGDOM'S NATIONS are all present here, and it's a matter of fidelity, not
// geography: "England" and "Scotland" were recognised, "Wales" was not — so
// "governed by the law of England and Wales", the most-cited applicable-law clause
// in the English-speaking world, became "England and Niort" (measured 17/08/2026 on an
// English employment contract; "pays de Galles" → "nevers" in French). A lawyer
// asking which law applies then gets an answer about a French commune.
// Recognised only, never emitted: these are not sovereign states, so the
// fake pool doesn't move an inch.
const NATIVE = [
  "Deutschland", "España", "Italia", "Nederland", "Österreich", "Schweiz",
  "Belgien", "Belgïe", "Sverige", "Danmark", "Suomi", "Polska", "United Kingdom",
  "United States", "USA", "UK", "États-Unis", "Etats-Unis", "Grande-Bretagne",
  "Wales", "Pays de Galles", "Cymru", "Northern Ireland", "Irlande du Nord",
];

const FR_SET = new Set(FR_COUNTRIES.map(strip));
const EN_SET = new Set(EN_COUNTRIES.map(strip));
const ALL = new Set([...FR_SET, ...EN_SET, ...NATIVE.map(strip)]);

/** True when `name` is a recognised COUNTRY (any language / native spelling). */
export function isCountry(name: string): boolean {
  return ALL.has(strip(name));
}

/** Swap a country for a DIFFERENT one in the same display language, preferring a
 *  same-length name (keeps layout, leaks no size). Deterministic on `h`; the casing
 *  follows the original (ALL-CAPS "FRANCE" → "BELGIQUE"). */
export function fakeCountry(value: string, h: number): string {
  const sv = strip(value);
  // English spelling that ISN'T also the FR spelling → keep it English; else FR.
  const lang = EN_SET.has(sv) && !FR_SET.has(sv) ? "en" : "fr";
  const all = lang === "en" ? EN_COUNTRIES : FR_COUNTRIES;
  const pool = all.filter((c) => strip(c) !== sv);
  const sameLen = pool.filter((c) => c.length === value.length);
  const arr = sameLen.length ? sameLen : pool.length ? pool : FR_COUNTRIES;
  return matchCase(arr[h % arr.length], value);
}
