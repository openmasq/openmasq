/**
 * DEV-ONLY generator for `src/engine/names/firstNames.insee.data.ts` — the INSEE long
 * tail of the first-name gazetteer. NOT bundled, NOT run in CI/build; run by hand to
 * refresh, then commit the regenerated file. The RUNTIME never reads the INSEE file —
 * only the generated pack ships (same contract as `gen-places.ts`).
 *
 * Source (official, first-party — root rule 7): INSEE « Fichier des prénoms », édition
 * 2025 — https://www.insee.fr/fr/statistiques/8595130 — national CSV
 * (`prenoms-2025-nat_csv.zip`). The zip's sha256 is PINNED below and verified before a
 * single line is read; a mismatch aborts (fail closed), it never "generates anyway".
 *
 * Usage:
 *   npx tsx packages/redact/scripts/gen-firstnames-insee.ts path/to/prenoms-2025-nat_csv.zip
 *
 * What ships and why (the collision policy of `firstNames.data.ts`, applied mechanically):
 *   • names with ≥ MIN_TOTAL births since 1900 — below that a name is so rare that its
 *     recall value is ~nil while every entry is title-case FP surface;
 *   • compounds are SPLIT (the detector's `givenOk` checks each part) — parts ≥ 2 chars,
 *     standalone names ≥ 3 chars (the detector's TOKEN floor);
 *   • EXCLUDED: bare particles, stopwords, anything whose vocab-key collides with the
 *     `VOCAB_TERMS`/`CLINIQUE_TERMS` allow-lists (an allow-listed word must never become
 *     reachable as a first name — `vocabGuards.test.ts` enforces exactly this, the
 *     generator keeps it green by construction), and city-collision names (the fake-place
 *     pools + `paris`);
 *   • gender marker (`:m`/`:f`) only at ≥ 95% single-sex among standalone births, and
 *     never for the documented unisex set (`gender.ts` wants those to stay null).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { isStopword } from "../src/model/detect";
import { VOCAB_TERMS, CLINIQUE_TERMS } from "../src/model/vocab";
import { FR_PLACES } from "../src/engine/geo/places.fr";
import { EU_PLACES } from "../src/engine/geo/places.eu";
import { NA_PLACES } from "../src/engine/geo/places.na";
import { ASIA_PLACES } from "../src/engine/geo/places.asia";

const ZIP_SHA256 = "4c3662bbc75a021a2203b9bed0beff7e85c7928779b88602814ed407cfee512e";
const CSV_NAME = "prenoms-2025-nat.csv";
const MIN_TOTAL = 100; // births since 1900 — ≈12.5k names; 50 only adds ~5k near-ghosts
const GENDER_RATIO = 0.95;

/** Same normalization as the lexicon: lowercase + strip diacritics. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
/** Same key as `vocabGuards.test.ts`: delimiters folded, accents KEPT. */
const vocabKey = (s: string) => s.trim().toLowerCase().replace(/[.\s_'’-]+/g, "");

/** Never a standalone given (the data-file header's exclusion list, plus kin). */
const PARTICLES = new Set(
  "van,de,la,le,les,du,der,den,von,ben,abu,ten,ter,da,di,del,dos,das,el,al,ibn,bint".split(","),
);
/** `gender.ts` keeps these null on purpose — a marker here would contradict it. */
const UNISEX = new Set("camille,dominique,claude,sacha,alix,charlie,andrea".split(","));
/** Folded forms of OCR-GLUED civil-status prose. Scanned documents glue « Né à … » /
 *  « Née à … » into one Title-case token whose fold is exactly these — with them in the
 *  lexicon, every « Néà LYON » birth line becomes a person (measured FP on the
 *  administratif corpus). The cost is the genuinely rare given « Néa » (120 births
 *  since 1900) — the same trade the city-collision exclusion makes for « Paris ». */
const CIVIL_GLUE = new Set(["nea", "neea", "nee"]);

function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("usage: tsx gen-firstnames-insee.ts <prenoms-2025-nat_csv.zip>");
    process.exit(1);
  }
  const zip = readFileSync(zipPath);
  const digest = createHash("sha256").update(zip).digest("hex");
  if (digest !== ZIP_SHA256) {
    throw new Error(
      `integrity check FAILED for ${zipPath}\n  expected ${ZIP_SHA256}\n  got      ${digest}\nRefusing to generate.`,
    );
  }
  const csv = strFromU8(unzipSync(zip)[CSV_NAME] ?? new Uint8Array());
  if (!csv) throw new Error(`${CSV_NAME} missing from ${zipPath} — refusing to generate.`);

  // Aggregate per FOLDED full name: total births + per-sex births (sexe: 1 = M, 2 = F).
  const total = new Map<string, number>();
  const male = new Map<string, number>();
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const [sexe, prenom, , valeur] = lines[i].split(";");
    if (!prenom || !valeur) continue;
    const name = fold(prenom.trim());
    const n = Number(valeur);
    if (!Number.isFinite(n)) continue;
    total.set(name, (total.get(name) ?? 0) + n);
    if (sexe === "1") male.set(name, (male.get(name) ?? 0) + n);
  }

  const vocabKeys = new Set([...VOCAB_TERMS, ...CLINIQUE_TERMS].map(vocabKey));
  const cities = new Set(
    [FR_PLACES, ...[EU_PLACES, NA_PLACES, ASIA_PLACES].flatMap(Object.values)]
      .flat()
      .map((p) => fold(p.city)),
  );
  cities.add("paris");

  const excluded: Record<string, string[]> = { particle: [], stopword: [], vocab: [], city: [], civilGlue: [] };
  const reject = (tok: string, standalone: boolean): string | null => {
    if (!/^[a-z]+$/.test(tok) || tok.length < (standalone ? 3 : 2)) return "shape";
    if (PARTICLES.has(tok)) return "particle";
    if (isStopword(tok)) return "stopword";
    if (vocabKeys.has(tok)) return "vocab";
    if (cities.has(tok)) return "city";
    if (CIVIL_GLUE.has(tok)) return "civilGlue";
    return null;
  };

  // keep: token → gender marker ("m" | "f" | ""). Parts of compounds carry NO marker of
  // their own (a "marie" inside "jean-marie" is male-typed there) — only standalone
  // births decide, below.
  const keep = new Map<string, string>();
  for (const [name, count] of total) {
    if (count < MIN_TOTAL) continue;
    const parts = name.split(/[-'’ ]/).filter(Boolean);
    for (const part of parts) {
      const why = reject(part, parts.length === 1);
      if (why) {
        if (excluded[why]) excluded[why].push(part);
        continue;
      }
      if (!keep.has(part)) keep.set(part, "");
    }
  }
  // Gender pass: standalone entries only, and only past the ratio bar.
  for (const [name, count] of total) {
    if (!keep.has(name) || UNISEX.has(name)) continue;
    const m = (male.get(name) ?? 0) / count;
    if (m >= GENDER_RATIO) keep.set(name, "m");
    else if (1 - m >= GENDER_RATIO) keep.set(name, "f");
  }

  const entries = [...keep.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([n, g]) => (g ? `${n}:${g}` : n));
  const PER_LINE = 180;
  const packed: string[] = [];
  for (let i = 0; i < entries.length; i += PER_LINE)
    packed.push(`  "${entries.slice(i, i + PER_LINE).join(",")}",`);

  const out = `// GENERATED by scripts/gen-firstnames-insee.ts — DO NOT EDIT BY HAND.
// Regenerate: npx tsx packages/redact/scripts/gen-firstnames-insee.ts <prenoms-2025-nat_csv.zip>
//
// Source: INSEE « Fichier des prénoms » 2025 (official, first-party) —
// https://www.insee.fr/fr/statistiques/8595130 — zip sha256-pinned in the generator,
// verified before generation (fail closed). ${entries.length} entries = names with
// ≥ ${MIN_TOTAL} births in France since 1900, folded lowercase+unaccented, compounds split,
// minus particles/stopwords/vocab-collisions/city-collisions (the collision policy of
// firstNames.data.ts, applied mechanically — see the generator header for the full list).
//
// Entry format: "name" or "name:m" / "name:f" (≥ ${GENDER_RATIO * 100}% single-sex among
// standalone births — consumed by model/gender.ts as a fallback behind its curated sets).
const PACK = [
${packed.join("\n")}
].join(",");

const NAMES = new Set<string>();
const M = new Set<string>();
const F = new Set<string>();
for (const e of PACK.split(",")) {
  const sep = e.indexOf(":");
  const name = sep === -1 ? e : e.slice(0, sep);
  NAMES.add(name);
  if (sep !== -1) (e.slice(sep + 1) === "m" ? M : F).add(name);
}
export const INSEE_FIRST_NAMES: ReadonlySet<string> = NAMES;
export const INSEE_MALE: ReadonlySet<string> = M;
export const INSEE_FEMALE: ReadonlySet<string> = F;
`;
  const dest = join(import.meta.dirname, "../src/engine/names/firstNames.insee.data.ts");
  writeFileSync(dest, out);

  console.error(`kept ${keep.size} tokens (${[...keep.values()].filter((g) => g === "m").length} m / ${[...keep.values()].filter((g) => g === "f").length} f) → ${dest}`);
  for (const [why, toks] of Object.entries(excluded))
    if (toks.length) console.error(`excluded (${why}): ${[...new Set(toks)].sort().join(", ")}`);
}

main();
