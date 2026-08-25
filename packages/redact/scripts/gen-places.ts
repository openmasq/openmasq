/**
 * DEV-ONLY generator for the multi-country fake-place tables (`src/engine/geo/`).
 * NOT bundled, NOT run in CI/build — run by hand to widen coverage.
 *
 * Source: the free GeoNames POSTAL dump — https://download.geonames.org/export/zip/
 * `allCountries.zip` (or a single-country `XX.zip`). Unzip to a `.txt`; each line is
 * TAB-separated:
 *   country postal place admin1 admin1code admin2 admin2code admin3 admin3code lat lon acc
 * i.e. field 0 = ISO2 country, 1 = postal code, 2 = city, 3 = admin region name.
 *
 * Usage:
 *   npx tsx packages/redact/scripts/gen-places.ts path/to/allCountries.txt > out.ts
 * then hand-review and paste the per-country arrays into places.eu.ts / places.na.ts
 * (or a new file), keeping ~20-40 rows per country spread across regions. The RUNTIME
 * never reads GeoNames — only these small curated arrays ship.
 */
import { readFileSync } from "node:fs";

// Countries we ship fakes for (extend as tables are added). Keep in sync with
// PLACES_BY_COUNTRY so a detected country always has somewhere to land.
const WANT = new Set([
  "FR", "DE", "ES", "IT", "GB", "NL", "BE", "CH", "PT", "AT", "LU", "IE", "US", "CA",
]);
const PER_COUNTRY = 30;
const PER_REGION = 4; // cap per admin region so the sample stays geographically spread

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx gen-places.ts <geonames allCountries.txt>");
    process.exit(1);
  }
  const byCountry: Record<string, { city: string; postal: string; region: string }[]> = {};
  const regionCount: Record<string, Record<string, number>> = {};

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const f = line.split("\t");
    const [country, postal, city, region] = [f[0], f[1], f[2], f[3]];
    if (!WANT.has(country) || !postal || !city) continue;
    byCountry[country] ??= [];
    regionCount[country] ??= {};
    if (byCountry[country].length >= PER_COUNTRY) continue;
    const rc = regionCount[country];
    const key = region || "?";
    if ((rc[key] ?? 0) >= PER_REGION) continue;
    rc[key] = (rc[key] ?? 0) + 1;
    byCountry[country].push({ city, postal, region: region || "" });
  }

  const q = (s: string) => JSON.stringify(s);
  for (const [country, places] of Object.entries(byCountry).sort()) {
    const rows = places.map((p) => `{ city: ${q(p.city)}, postal: ${q(p.postal)}, region: ${q(p.region)} }`);
    console.log(`  ${country}: [\n    ${rows.join(", ")},\n  ],`);
  }
}

main();
