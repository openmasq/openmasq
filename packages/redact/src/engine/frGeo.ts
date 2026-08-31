// French administrative geography: departments + regions, for BOTH detection
// (so a *département* / *région* is redacted as another department/region — not
// mistyped as a city or a person name) AND believable fakes (a different, real
// department/region). Also exposes `depToRegion` so the CITY/POSTAL fakes can pick
// a replacement place in the SAME region as the original (see model/fakes.ts).
// Pure data + regex — no DOM/Electron. Verbatim matches → reversible via the vault.
import type { Detection } from "../types";

// Region → its departments as [code, name]. `code` is the 2-char INSEE code
// (Corsica 2A/2B; overseas 971-976). The code's first 2 chars key `DEP2_TO_REGION`
// (a 5-digit CP's first 2 digits → its region), so "35136" → "35" → "Bretagne".
export const REGION_DEPTS: Record<string, [string, string][]> = {
  "Auvergne-Rhône-Alpes": [["01", "Ain"], ["03", "Allier"], ["07", "Ardèche"], ["15", "Cantal"], ["26", "Drôme"], ["38", "Isère"], ["42", "Loire"], ["43", "Haute-Loire"], ["63", "Puy-de-Dôme"], ["69", "Rhône"], ["73", "Savoie"], ["74", "Haute-Savoie"]],
  "Bourgogne-Franche-Comté": [["21", "Côte-d'Or"], ["25", "Doubs"], ["39", "Jura"], ["58", "Nièvre"], ["70", "Haute-Saône"], ["71", "Saône-et-Loire"], ["89", "Yonne"], ["90", "Territoire de Belfort"]],
  "Bretagne": [["22", "Côtes-d'Armor"], ["29", "Finistère"], ["35", "Ille-et-Vilaine"], ["56", "Morbihan"]],
  "Centre-Val de Loire": [["18", "Cher"], ["28", "Eure-et-Loir"], ["36", "Indre"], ["37", "Indre-et-Loire"], ["41", "Loir-et-Cher"], ["45", "Loiret"]],
  "Corse": [["2A", "Corse-du-Sud"], ["2B", "Haute-Corse"]],
  "Grand Est": [["08", "Ardennes"], ["10", "Aube"], ["51", "Marne"], ["52", "Haute-Marne"], ["54", "Meurthe-et-Moselle"], ["55", "Meuse"], ["57", "Moselle"], ["67", "Bas-Rhin"], ["68", "Haut-Rhin"], ["88", "Vosges"]],
  "Hauts-de-France": [["02", "Aisne"], ["59", "Nord"], ["60", "Oise"], ["62", "Pas-de-Calais"], ["80", "Somme"]],
  "Île-de-France": [["75", "Paris"], ["77", "Seine-et-Marne"], ["78", "Yvelines"], ["91", "Essonne"], ["92", "Hauts-de-Seine"], ["93", "Seine-Saint-Denis"], ["94", "Val-de-Marne"], ["95", "Val-d'Oise"]],
  "Normandie": [["14", "Calvados"], ["27", "Eure"], ["50", "Manche"], ["61", "Orne"], ["76", "Seine-Maritime"]],
  "Nouvelle-Aquitaine": [["16", "Charente"], ["17", "Charente-Maritime"], ["19", "Corrèze"], ["23", "Creuse"], ["24", "Dordogne"], ["33", "Gironde"], ["40", "Landes"], ["47", "Lot-et-Garonne"], ["64", "Pyrénées-Atlantiques"], ["79", "Deux-Sèvres"], ["86", "Vienne"], ["87", "Haute-Vienne"]],
  "Occitanie": [["09", "Ariège"], ["11", "Aude"], ["12", "Aveyron"], ["30", "Gard"], ["31", "Haute-Garonne"], ["32", "Gers"], ["34", "Hérault"], ["46", "Lot"], ["48", "Lozère"], ["65", "Hautes-Pyrénées"], ["66", "Pyrénées-Orientales"], ["81", "Tarn"], ["82", "Tarn-et-Garonne"]],
  "Pays de la Loire": [["44", "Loire-Atlantique"], ["49", "Maine-et-Loire"], ["53", "Mayenne"], ["72", "Sarthe"], ["85", "Vendée"]],
  "Provence-Alpes-Côte d'Azur": [["04", "Alpes-de-Haute-Provence"], ["05", "Hautes-Alpes"], ["06", "Alpes-Maritimes"], ["13", "Bouches-du-Rhône"], ["83", "Var"], ["84", "Vaucluse"]],
  "Outre-mer": [["971", "Guadeloupe"], ["972", "Martinique"], ["973", "Guyane"], ["974", "La Réunion"], ["976", "Mayotte"]],
};

export const REGIONS: string[] = Object.keys(REGION_DEPTS);
export const DEPARTMENTS: { code: string; name: string; region: string }[] = [];
const DEP2_TO_REGION: Record<string, string> = {};
for (const [region, deps] of Object.entries(REGION_DEPTS)) {
  for (const [code, name] of deps) {
    DEPARTMENTS.push({ code, name, region });
    // 2A/2B → "20" (Corsican CPs are 20xxx); overseas keep their 3-char prefix key.
    const key = code === "2A" || code === "2B" ? "20" : code.slice(0, 2);
    DEP2_TO_REGION[key] = region;
  }
}

/** Region of a 5-digit French postal code ("35136" → "Bretagne"), or undefined. */
export function depToRegion(dep2: string): string | undefined {
  return DEP2_TO_REGION[dep2];
}
export function regionOfCp(cp: string): string | undefined {
  return /^\d{5}$/.test(cp) ? depToRegion(cp.slice(0, 2)) : undefined;
}

// 2-digit CP prefix → its DEPARTMENT. Corsican CPs (20xxx) are ambiguous 2A/2B → pick
// 2A (Corse-du-Sud); overseas keep their 3-char code. Used by the geo-block coherence
// so a fake commune's postal and the fake "Département" field name the SAME real place.
const DEP2_TO_DEPT: Record<string, { code: string; name: string }> = {};
for (const d of DEPARTMENTS) {
  const key = d.code === "2A" || d.code === "2B" ? "20" : d.code.slice(0, 2);
  DEP2_TO_DEPT[key] ??= { code: d.code, name: d.name };
}
/** Department NAME of a 5-digit French postal code ("89000" → "Yonne"), or undefined. */
export function departmentOfCp(cp: string): string | undefined {
  if (!/^\d{5}$/.test(cp)) return undefined;
  const pre = cp.slice(0, 2);
  return DEP2_TO_DEPT[pre === "20" ? "20" : pre]?.name ?? DEP2_TO_DEPT[cp.slice(0, 3)]?.name;
}

// A name is "distinctive" (safe to match ungated) when it's a compound — a hyphen,
// apostrophe or space (Ille-et-Vilaine, Val-d'Oise, Bouches-du-Rhône, Loire-
// Atlantique, Territoire de Belfort…). Bare single words (Nord, Cher, Var, Loire,
// Paris…) collide with ordinary words/cities, so they only match when GATED behind
// a "département" keyword — precision over recall, per the no-over-redaction bar.
const isDistinctive = (n: string) => /[-'’ ]/.test(n);
const METRO = DEPARTMENTS.filter((d) => d.region !== "Outre-mer");
const DISTINCTIVE_DEPTS = METRO.filter((d) => isDistinctive(d.name)).map((d) => d.name);
const AMBIGUOUS_DEPTS = METRO.filter((d) => !isDistinctive(d.name)).map((d) => d.name);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Longest-first so "Loire-Atlantique" wins over a bare "Loire", "Haute-Corse" over "Corse".
const alt = (names: string[]) => [...names].sort((a, b) => b.length - a.length).map(esc).join("|");
const NAME_BOUNDARY_L = "(?<![\\p{L}0-9])";
const NAME_BOUNDARY_R = "(?![\\p{L}0-9])";

// Distinctive departments + all regions: matched anywhere, case-insensitively, but
// the hit must START with an uppercase letter (a proper noun) — so lowercase prose
// ("corse", "la loire") and a bare adjective never trip it.
const DISTINCTIVE_RE = new RegExp(`${NAME_BOUNDARY_L}(?:${alt(DISTINCTIVE_DEPTS)})${NAME_BOUNDARY_R}`, "giu");
const REGION_RE = new RegExp(`${NAME_BOUNDARY_L}(?:${alt(REGIONS.filter((r) => r !== "Outre-mer"))})${NAME_BOUNDARY_R}`, "giu");
// Ambiguous single-word departments: only after a "département" keyword.
const GATED_DEPT_RE = new RegExp(
  `\\bd[ée]partements?\\s+(?:de\\s+la\\s+|de\\s+l['’]|des\\s+|du\\s+|de\\s+|d['’])?(${alt(AMBIGUOUS_DEPTS)})${NAME_BOUNDARY_R}`,
  "giu",
);

const startsUpper = (v: string) => {
  const c = v.match(/\p{L}/u)?.[0] ?? "";
  return c !== "" && c === c.toUpperCase() && c !== c.toLowerCase();
};

/**
 * Detect French departments (category DEPARTMENT) and regions (REGION) so they are
 * faked as ANOTHER department/region instead of leaking to the NER as a city/name.
 * Distinctive names + regions match ungated (uppercase-initial guard); ambiguous
 * single-word departments only after a "département" keyword. Verbatim → reversible.
 */
export function detectFrGeo(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  const push = (value: string, category: string, start: number) => {
    const key = `${category}::${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    // country FR so `geoBlocks` anchors a FR block even when it has no Commune/PLACE field.
    out.push({ value, category, country: "FR", start });
  };
  for (const m of text.matchAll(DISTINCTIVE_RE)) if (startsUpper(m[0])) push(m[0], "DEPARTMENT", m.index);
  // The gated dept captures the NAME in group 1; its offset is after the keyword.
  for (const m of text.matchAll(GATED_DEPT_RE)) if (startsUpper(m[1])) push(m[1], "DEPARTMENT", m.index + m[0].indexOf(m[1]));
  for (const m of text.matchAll(REGION_RE)) if (startsUpper(m[0])) push(m[0], "REGION", m.index);
  return out;
}

const DEPT_NAMES = DEPARTMENTS.map((d) => d.name);
const REGION_NAMES = REGIONS.filter((r) => r !== "Outre-mer");
const regionOfDeptName = (n: string) =>
  DEPARTMENTS.find((d) => d.name.toLowerCase() === n.toLowerCase())?.region;

/** A DIFFERENT real department — preferring the same region as the original (plausible). */
/**
 * ⚠️ The INITIAL keeps its class (vowel ↔ consonant), and this isn't cosmetic.
 *
 * French elides IN FRONT OF the fake, not the real value: « Crédit Agricole Mutuel
 * d'Ille-et-Vilaine » became « d'Morbihan » (measured 15/08/2026) — unreadable, and
 * identifiable as a fake, which ruins the plausibility that is the whole point of
 * fakes. The article can't be rewritten: it lives OUTSIDE the span, and rewriting it would break
 * restitution in the other direction (« de Ille-et-Vilaine »). Keeping the initial's class
 * is enough and costs nothing: « d' » stays correct in front of a vowel, « de/du » in front of a
 * consonant, whatever article the text carries.
 *
 * Explicit fallback: if the subset is empty, the whole pool is reused — a fake
 * that's grammatically clunky beats no fake at all.
 */
const startsWithVowel = (s: string): boolean => /^[aeiouyàâäéèêëîïôöùûü]/i.test(s.trim());

function sameInitialClass(pool: string[], value: string): string[] {
  const v = startsWithVowel(value);
  const filtré = pool.filter((n) => startsWithVowel(n) === v);
  return filtré.length ? filtré : pool;
}

export function fakeDepartment(value: string, h: number): string {
  const real = value.toLowerCase();
  const region = regionOfDeptName(value);
  const memeRegion = region
    ? DEPARTMENTS.filter((d) => d.region === region && d.name.toLowerCase() !== real).map((d) => d.name)
    : [];
  const national = DEPT_NAMES.filter((n) => n.toLowerCase() !== real);
  // ⚠️ ORDER OF PREFERENCES, and it matters: REGION coherence is a comfort,
  // grammar is what's read. Brittany has no vowel-initial department other than
  // Ille-et-Vilaine: keeping the region cost « d'Morbihan » every single time. So the preference
  // order is: same region AND same initial class → same class (national) →
  // same region → any.
  const memeRegionEtClasse = sameInitialClass(memeRegion, value);
  const pool = memeRegion.length && memeRegionEtClasse !== memeRegion
    ? memeRegionEtClasse
    : sameInitialClass(national, value).length !== national.length
      ? sameInitialClass(national, value)
      : memeRegion.length
        ? memeRegion
        : national;
  return matchCase(pool[h % pool.length], value);
}

/** A DIFFERENT real region. */
export function fakeRegion(value: string, h: number): string {
  const real = value.toLowerCase();
  // Same reason as above: « en Île-de-France » ⇄ « en Auvergne », never « en Bretagne »
  // where the text elided (`sameInitialClass`).
  const pool = sameInitialClass(REGION_NAMES.filter((n) => n.toLowerCase() !== real), value);
  return matchCase(pool[h % pool.length], value);
}

/** Mirror the original's casing bucket (ALL-CAPS stays ALL-CAPS) so layout holds. */
export function matchCase(fake: string, original: string): string {
  return original === original.toUpperCase() && /\p{Lu}/u.test(original) ? fake.toUpperCase() : fake;
}
