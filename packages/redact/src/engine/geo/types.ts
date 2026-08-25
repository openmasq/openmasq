// Multi-country geographic fake data. A redacted address / place / postal code is
// swapped for a REAL place of the SAME country, in that country's own FORMAT — so a
// German address stays German, a US one stays "City, ST zip", etc. Pure data.

/** ISO-3166-1 alpha-2 country code. */
export type ISO2 = string;

/** A real place: city + a real postal code + its admin region/state/Land/province. */
export interface GeoPlace {
  city: string;
  postal: string;
  region: string;
}

/** Format an address line for a country from its parts (street number + name + place). */
export type AddressFormatter = (num: number, street: string, place: GeoPlace) => string;
