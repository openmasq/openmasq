// Multilingual street-address + postal-code detector. A NER model catches the
// city/name but NOT a full street address, and there's no fixed "address" shape
// a single regex can match across languages — the number/type/name order differs:
//   FR/PT  "36 rue du Capitaine Glarner"   number → type → name
//   ES/IT  "Calle Mayor 3" / "Via Roma 12" type → name → number
//   EN     "221 Baker Street"              number → name → type
//   DE/NL  "Musterstraße 12"               name+type compound → number
// Each shape ALSO consumes its trailing "postal + city" (or, for EN, "City ST ZIP")
// on the same line, so the WHOLE address is one span with ONE country — the code and
// the city are then faked TOGETHER, in that country's format (see engine/geo). The
// country comes from the street keyword (romance → FR/ES/IT/PT, germanic → DE/NL) or,
// for EN, the trailing postal (US ZIP / CA / GB postcode). Emitted as `{value,
// category, country}` for `pseudonymize`. Deterministic + language-agnostic-by-extension.
import type { Detection } from "../types";

import { PRE, SUF, DE, H, W, NAME, TAIL_CORE, TAIL_ZIPCITY, TAIL_CITYZIP } from "./addressShapes";
import { trimAddressTail } from "./addressTail";

// Re-exported: `trimAddressTail` used to live here, and consumers import it from this path.
export { trimAddressTail } from "./addressTail";

/** A per-address country hint, or a resolver from the captured value. */
type CountryHint = string | ((v: string) => string | undefined);

/** Refine a Romance "type name" address to its country by the street keyword.
 *  Default FR (shared words rue/avenue/boulevard/place lean French). */
function romance(v: string): string {
  const lv = v.toLowerCase();
  if (/(?:^|\W)(calle|avenida|avda|paseo|plaza|camino|carretera)(?:\W|$)/.test(lv)) return "ES";
  if (/(?:^|\W)(via|viale|corso|piazza|vicolo|largo|strada)(?:\W|$)/.test(lv)) return "IT";
  if (/(?:^|\W)(rua|travessa|pra[çc]a)(?:\W|$)/.test(lv)) return "PT";
  return "FR";
}
/** DE vs NL by the compound street type (straat/laan/plein = NL, else DE). */
const dutchOrGerman = (v: string): string => (/straat|laan|plein/i.test(v) ? "NL" : "DE");
/** EN address country from its trailing postal: US "ST 10001" / CA "A1A 1A1" / else GB. */
function anglo(v: string): string {
  if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(v)) return "US";
  if (/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/.test(v)) return "CA";
  return "GB";
}

/** Trim trailing separators / a trailing dangling clause from a captured span. */
function clean(v: string): string {
  return v.replace(/[\s,;.]+$/u, "").replace(/\s{2,}.*$/u, "").trim();
}

function pushAll(
  text: string,
  re: RegExp,
  category: string,
  out: Detection[],
  seen: Set<string>,
  minLen = 6,
  country?: CountryHint,
) {
  for (const m of text.matchAll(re)) {
    const value = clean(category === "ADDRESS" ? trimAddressTail(m[0]) : m[0]);
    if (value.length < minLen) continue;
    const key = `${category}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = typeof country === "function" ? country(value) : country;
    out.push({ value, category, country: c, start: m.index });
  }
}

/**
 * Detect street addresses (any language shape, incl. their trailing postal+city) +
 * standalone postal codes next to a place name. Values are verbatim; category
 * ADDRESS / POSTAL_CODE / PLACE, each with a best-effort ISO-3166 `country`
 * (undefined when it can't be told — e.g. CJK, which has no fake table → the fake
 * keeps the shape, never a wrong-country place).
 */
export function detectAddresses(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();

  // Shape A — number → type → name (+ optional "CP Ville"): "36 AV … 35000 Rennes".
  pushAll(
    text,
    new RegExp(`\\b\\d{1,4}(?:${H}?(?:bis|ter|quater))?${W}(?:${PRE})\\.?${H}+${NAME}${TAIL_ZIPCITY}`, "giu"),
    "ADDRESS", out, seen, 6, romance,
  );
  // Shape B — type → name → number (+ optional "CP Ville"): "Calle Mayor 3 28013
  // Madrid". ES/IT/PT types ONLY — that order is theirs; letting the FRENCH types
  // in read a legal-article reference ("articles R. 5312-38 … du code du travail",
  // type "r" + number) and schedule prose ("entre le 28 du mois en cours et le 15",
  // type "cours") as ADDRESSES and faked them into street addresses.
  const PRE_B =
    "calle|avenida|avda|paseo|plaza|camino|carretera|via|viale|corso|piazza|vicolo|largo|strada|rua|travessa|pra[çc]a";
  pushAll(
    text,
    new RegExp(`\\b(?:${PRE_B})\\.?${W}${NAME}?${H}+\\d{1,4}\\b${TAIL_ZIPCITY}`, "giu"),
    "ADDRESS", out, seen, 6, romance,
  );
  // Shape B-fr — a FRENCH street WITHOUT its house number ("rue du 8 Mai 1945,
  // 75012 Paris"): the trailing "CP Ville" is REQUIRED — it is what separates a
  // real number-less street from the legal-article/prose false positives above.
  pushAll(
    text,
    new RegExp(`\\b(?:${PRE})\\.?${W}${NAME}(?:${TAIL_CORE})`, "giu"),
    "ADDRESS", out, seen, 6, romance,
  );
  // Shape D — number → name → type (+ optional "City ST ZIP"): US/GB/CA. Country from
  // the trailing postal (US ZIP / CA / GB postcode), else GB.
  pushAll(
    text,
    new RegExp(`\\b\\d{1,5}(?:${W}(?:${SUF})|${H}+${NAME}${H}+(?:${SUF}))\\b${TAIL_CITYZIP}`, "giu"),
    "ADDRESS", out, seen, 6, anglo,
  );
  // FR minor street types ("2 mail Camille du Gast", sente/venelle/hameau/clos) —
  // NOT in `PRE`: their words are ordinary English/French nouns ("2 mail messages"),
  // so this shape additionally requires the street NAME to start CAPITALIZED.
  pushAll(
    text,
    new RegExp(
      `\\b\\d{1,4}(?:${H}?(?:bis|ter|quater))?${W}(?:[Mm]ail|[Ss]ente|[Vv]enelle|[Hh]ameau|[Cc]los)\\.?${H}+\\p{Lu}${NAME}?${TAIL_ZIPCITY}`,
      "gu",
    ),
    "ADDRESS", out, seen, 6, () => "FR",
  );
  // DE/NL — name+type compound → number (+ optional "PLZ Stadt" / "NNNN AB Stad").
  pushAll(
    text,
    new RegExp(`\\b\\p{Lu}[\\p{L}]{2,}(?:${DE})\\.?${W}\\d{1,4}\\b${TAIL_ZIPCITY}`, "giu"),
    "ADDRESS", out, seen, 6, dutchOrGerman,
  );

  // CN/JP — contiguous Han/Kana(+digits) address anchored big-region → smaller unit.
  // No fake table yet → country undefined (the fake keeps the shape). `CJK` = Han/Kana + (fw)digits + hyphen.
  const CJK = "\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}0-9０-９\\-－号號室";
  pushAll(
    text,
    new RegExp(
      `[${CJK}]{0,12}(?:省|市|都|道|府|県)[${CJK}]{0,16}(?:区|區|县|縣|市|町|村|郡|路|街|丁目|番地|号|號)[${CJK}]{0,20}`,
      "gu",
    ),
    "ADDRESS", out, seen,
  );
  // KR — space-separated Hangul (no fake table → undefined).
  pushAll(
    text,
    new RegExp(
      `[\\p{sc=Hangul}]+(?:시|도)(?:\\s+[\\p{sc=Hangul}]+(?:구|군|동|읍|면|로|길))+(?:\\s+\\d+[\\p{sc=Hangul}0-9\\-]*)?`,
      "gu",
    ),
    "ADDRESS", out, seen,
  );

  // 5-digit codes already INSIDE a detected ADDRESS block → don't re-detect them as a
  // bare FR PLACE / POSTAL_CODE (they were faked with the address's real country).
  const consumedCp = new Set<string>();
  for (const d of out) {
    if (d.category !== "ADDRESS") continue;
    for (const mm of d.value.matchAll(/\b\d{5}\b/g)) consumedCp.add(mm[0]);
  }

  // FR — the NOTARIAL/administrative order, city BEFORE its parenthesised CP:
  // "demeurant à ASNIÈRES-SUR-SEINE (92600)", "Né à PARIS 18ÈME ARRONDISSEMENT
  // (75018)", "situé à SAINT-OUEN (SEINE-SAINT-DENIS 93400". The "CP Ville" PLACE
  // rule below cannot see this shape, so the NER faked the city while the REAL
  // postal survived inside the parens — re-identifying the place. One span (city +
  // parens), gated on the preceding "à" (demeurant à / né à / situé à) so a bare
  // "NAME (12345)" elsewhere never matches. The parens may carry a department
  // before the CP, and OCR routinely drops the closing paren — both tolerated (the
  // 5-digit CP anchors the end, so nothing can be swallowed past it).
  // Tokens may START with a digit ("PARIS 17ÈME ARRONDISSEMENT") and the run may
  // wrap once per joiner (a deed's narrow column breaks "17ÈME\nARRONDISSEMENT").
  const CITY_TOK = "[\\p{Lu}\\d][\\p{Lu}\\p{L}\\d'’-]*";
  const CITY_JOIN = "(?:[ \\t]+|\\r?\\n[ \\t]*)";
  // …and the labels that introduce the same place WITHOUT « à »: « agence de NANTES
  // (44000) », « Lieu de signature : BORDEAUX (33000) », « au siège, DIJON (21000) ».
  // An ALLOW-list, never a loosening of the context: the guard stays the
  // label, exactly like for the identifiers. Opening the door to a bare separator
  // (« : » or « , ») would turn « Référence : DOSSIER (12345) » into a place.
  // ⚠️ The casing CANNOT be carried by a flag: `i` would make `\p{Lu}` match lowercase
  // in `CITY_TOK` and the rule would catch « il habite (75008) ». Each letter of the
  // label is therefore made case-insensitive one at a time, the VALUE staying capitalised.
  const ci = (w: string): string =>
    [...w].map((c) => (c.toLowerCase() === c.toUpperCase() ? c : `[${c.toLowerCase()}${c.toUpperCase()}]`)).join("");
  const PLACE_CUE = ["siège", "siege", "domiciliation", "domiciliée", "domiciliee", "domicilié",
    "domicilie", "demeurant", "résidant", "residant", "agence", "commune", "ville", "signature",
    "sis", "située", "situee", "situé", "situe", "née", "né", "fait"]
    .sort((a, b) => b.length - a.length).map(ci).join("|");
  const CITY_CP_RE = new RegExp(
    `(?<=(?:[àa]\\s{1,3}|(?:${PLACE_CUE})\\b[^\\S\\r\\n]*[:,.–—-]?[^\\S\\r\\n]*(?:[dD][eu]s?[^\\S\\r\\n]+)?))` +
      `${CITY_TOK}(?:${CITY_JOIN}${CITY_TOK}){0,4}\\s*\\(\\s*(?:${CITY_TOK}(?:[ ]${CITY_TOK}){0,3}\\s+)?(\\d{5})\\s*\\)?`,
    "gu",
  );
  for (const m of text.matchAll(CITY_CP_RE)) {
    const value = clean(m[0]);
    const key = `PLACE::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Only claim the CP when it survived clean() — a span truncated at a column
    // gap must leave the code to the bare POSTAL_CODE fallback, never absorb it.
    if (value.includes(m[1]!)) consumedCp.add(m[1]!);
    out.push({ value, category: "PLACE", country: "FR", start: m.index });
  }

  // FR — a STANDALONE "CP + Ville" (no street on the line) as ONE coherent PLACE, so
  // the code and city are faked TOGETHER from ONE real place (they used to be split —
  // the code to POSTAL_CODE, the city left to the NER, which faked them apart or
  // mistyped an ALL-CAPS city like "MALAKOFF" as a NAME → "37000 Nathan"). A bare
  // 5-digit is ambiguous FR/DE/ES/IT — a standalone one assumes FR (the primary case;
  // a foreign "PLZ Stadt" glued to a street is already handled by that shape above).
  const PLACE_RE = new RegExp(
    // Separator HORIZONTAL and city ≥2 letters: a « CP Ville » is a one-line shape, and
    // `\\s+` let a code take the next LINE's first character as its commune
    // (« …12345\\nE. Numéro d'identification » on a carte grise).
    `\\b([0-9OoIl]{5})[ \\t\u00A0\u202F]+((?:(?:Le|La|Les|L['’]|Saint[e]?|Sainte|St[e]?|Mont)[ -])?\\p{L}[\\p{L}]+(?:[-'’]\\p{L}+)*)` +
      // SPACE-separated commune continuation, connector-led ("ST OUEN SUR SEINE",
      // "VITRY LE FRANCOIS" — administrative docs drop the hyphens): each chunk is
      // a French toponym connector then a word. Without it the span stopped after
      // the first word and the tail shipped in clear beside the faked city
      // ("29200 BREST SUR SEINE" — "SUR SEINE" narrowing the real location).
      `((?:[ ](?:SUR|SOUS|LES|L[EÈ]S|EN|AUX?|LE|LA|DU|DE|D['’]?)[ ]\\p{L}[\\p{L}'’-]*)*)`,
    "giu",
  );
  for (const m of text.matchAll(PLACE_RE)) {
    // OCR tolerance on the CODE itself: a scanned "60000" comes back "6O00O" (O read for
    // zero, l/I for one), and the postal then survived beside a FAKED city — the exact
    // split this joint CP+city span exists to prevent. Bounded to ≥2 TRUE digits, so a
    // capitalised word can never open a place. The value keeps the garbled form verbatim
    // (it is the vault key); `fakeGeo` emits a clean one.
    if ((m[1].match(/\d/g) ?? []).length < 2) continue;
    if (consumedCp.has(m[1])) continue;
    const first = m[2].match(/\p{L}/u)?.[0] ?? "";
    if (first === "" || first !== first.toUpperCase() || first === first.toLowerCase()) continue; // city must start uppercase (a real place, not "35136 rue…")
    // The connector-led continuation is kept only when its CASING matches an
    // administrative city (ALL-CAPS): "93400 ST OUEN SUR SEINE" is one commune,
    // but prose "44000 NANTES en Bretagne" is a sentence — the lowercase
    // connector rejects it (a Title-cased prose commune hyphenates instead).
    const keepCont = !!m[3] && m[3] === m[3].toUpperCase();
    // VERBATIM span (the CP↔city separator may be any \s+): full match, minus the
    // continuation when its casing rejected it.
    const value = keepCont ? m[0] : m[0].slice(0, m[0].length - (m[3]?.length ?? 0));
    const key = `PLACE::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    consumedCp.add(m[1]);
    out.push({ value, category: "PLACE", country: "FR", start: m.index });
  }
  // Fallback: a 5-digit code followed by a Capitalised word the PLACE rule didn't
  // consume (unusual city shape) → the CODE alone, so it never leaks (country
  // undefined → FR default). Plus UK alphanumeric (→ GB).
  for (const m of text.matchAll(/\b(\d{5})\b(?=\s+\p{Lu})/gu)) {
    if (consumedCp.has(m[1])) continue;
    const key = `POSTAL_CODE::${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: m[1], category: "POSTAL_CODE", start: m.index });
  }
  pushAll(text, new RegExp(`\\b[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}\\b`, "g"), "POSTAL_CODE", out, seen, 5, "GB");
  // JP postal. The 〒 marker is distinctive: it's enough on its own. The BARE
  // `NNN-NNNN` form, on the other hand, isn't — it requires a JAPANESE context (at least one
  // CJK character in the text).
  // ⚠️ Without this gate, it claimed the TAIL of any North-American number:
  // « +1 (555) 123-4567 » came out as « +1 (555) 864-2086 » — the area code left in
  // clear under a value that looked redacted (reported on 11/08). Half-protection
  // is worse than none: it's reassuring. And a bare `\d{3}-\d{4}` contradicts the engine's
  // precision bar ("a bare digit run is never a rule on its own") — an order
  // reference has exactly this shape.
  const hasCjk = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/u.test(text);
  pushAll(
    text,
    new RegExp(hasCjk ? `〒\\s?\\d{3}-?\\d{4}|\\b\\d{3}-\\d{4}\\b` : `〒\\s?\\d{3}-?\\d{4}`, "gu"),
    "POSTAL_CODE",
    out,
    seen,
    7,
  );

  return out;
}
