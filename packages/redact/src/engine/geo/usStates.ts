// US states (+ DC): 2-letter abbreviation ↔ full name. Used by the geo-block coherence
// so a fake "State" field matches the fake city's real state, and is FORMAT-preserving
// (a full-name field → a full-name fake, an abbreviation → an abbreviation). Pure data.

/** Full name → 2-letter code. */
export const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA",
  Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

/** 2-letter code → full name. */
export const US_STATE_ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_NAME_TO_ABBR).map(([name, abbr]) => [abbr, name]),
);

const NAME_LOWER = new Map(
  Object.keys(US_STATE_NAME_TO_ABBR).map((n) => [n.toLowerCase(), n]),
);

/** True when `v` is a US state — a full name (case-insensitive) or a 2-letter code. */
export function isUsState(v: string): boolean {
  const t = v.trim();
  return NAME_LOWER.has(t.toLowerCase()) || US_STATE_ABBR_TO_NAME[t.toUpperCase()] !== undefined;
}

/** The full name of a US state given its abbreviation ("NY" → "New York"), or undefined. */
export function usStateName(abbr: string): string | undefined {
  return US_STATE_ABBR_TO_NAME[abbr.trim().toUpperCase()];
}

/** True when `v` is written as a FULL name (not a 2-letter code). */
export function isUsStateFullName(v: string): boolean {
  return NAME_LOWER.has(v.trim().toLowerCase());
}
