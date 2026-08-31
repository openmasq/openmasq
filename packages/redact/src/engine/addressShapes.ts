// The address SHAPES' vocabulary: the street-type keyword sets, the two JOIN classes and
// the trailing "postal + city" tails. Split out of `addresses.ts` so that file keeps only
// the detection logic — these are regex FRAGMENTS composed into the per-language shapes,
// and the per-country keyword lists are what you extend to cover a new language.
// Street-type keywords. `pre` = type precedes the name (FR/ES/IT/PT); `suf` = the
// name precedes the type (EN); `de` = name+type compound then number (DE/NL).
export const PRE = "rue|r|avenue|av|ave|boulevard|bd|bld|all[ée]e|impasse|imp|place|pl|chemin|route|rte|quai|cours|passage|square|voie|faubourg|sentier|venelle|hameau|lotissement|résidence|residence|esplanade|parvis|rond-point|calle|avenida|avda|paseo|plaza|camino|carretera|via|viale|corso|piazza|vicolo|largo|strada|rua|travessa|pra[çc]a";
export const SUF = "street|avenue|ave|road|rd|boulevard|blvd|lane|drive|way|court|place|square";
export const DE = "stra(?:ße|sse)|str|weg|platz|gasse|allee|ring|laan|straat|plein";

// `H` = horizontal space; `W` = a join that tolerates ONE line wrap. The distinction is
// load-bearing. Plain `\s` eats a newline, and that is how the tail of the PREVIOUS line
// fused with the head of an address ("RCS Nanterre 775 384 225\ndomiciliée 4 avenue" read
// as a UK street): the join was bordered by the permissive `NAME`, which happily spans the
// junk before the real street type. So a join with `NAME` on the far side is `H` — strictly
// same-line. A join whose far side is the street TYPE keyword itself is `W`: the keyword
// anchors the match, nothing else can slip in, and a hard-wrapped scan genuinely breaks
// there ("Résidence 27\nRUE DES ORMEAUX", OCR). ONE wrap only, like the identifier rules'
// `maxOneWrap` — two newlines is a COLUMN of unrelated lines, not a wrapped address.
// The captured value KEEPS its newline verbatim (it is the vault key); `NAME`/`CITY` are
// newline-free by construction (their class carries a plain space only), and the TAIL keeps
// `[,\s]+` because an address block legitimately wraps before its "CP Ville" line.
// Pinned in `detectors.test.ts`.
export const H = "[^\\S\\r\\n]";
export const W = `(?:${H}*(?:,${H}*)?\\r?\\n${H}*|(?:,|${H})+)`;

// Street NAME: permissive (digits/spaces/hyphens — "rue du 8 Mai 1945"), but tempered
// two ways. (1) It must STOP before a "sep + 5-digit postal" run — the class contains
// space+digits, so a long name otherwise swallows the postal+city up to its 40-char cap
// and gets cut MID-WORD ("…92528 NEUILLY-SUR-SE"), a value `applyVault` then rightly
// refuses to substitute inside a word → the WHOLE address ships in clear while sitting
// in the vault. (2) It must END on a word boundary, so the cap itself can never cut a
// word in half either.
// (3) It must STOP before an AMOUNT. The class accepts digits AND spaces — for
// « rue du 8 Mai 1945 », which can't be sacrificed — so on text WITHOUT punctuation
// it runs to its 38-char cap and carries off whatever follows the street. Measured on a
// tradesman's sentence: « 12 rue des lilas a vitry 2400 euros ht pose comprise » went out as ONE
// zone, replaced wholesale by a fake address — the amount never reached the
// model, and the quote came back with no price. `trimAddressTail` doesn't catch this case: it
// cuts at the "postal code + city", and there is no postal code here.
// The guard is deliberately narrow: no street is called « … 2400 euros HT ». A number
// followed by a currency or a tax mention is never a street name.
export const MONEY_AHEAD = "(?![,\\s]*\\d[\\d  .,]*\\s*(?:€|EUR\\b|euros?\\b|HT\\b|TTC\\b))";
export const NAME =
  `(?:[\\p{L}0-9](?:(?![,\\s]+(?:[-–—][,\\s]*)?\\d{5}\\b)${MONEY_AHEAD}[\\p{L}0-9'’.\\- ]){1,38}[\\p{L}0-9.](?![\\p{L}0-9]))`;

// Trailing "postal City" (FR/ES/IT 5-digit, PT NNNN-NNN, NL "NNNN AB", BE/CH/AT/LU
// 4-digit), optionally consumed so the whole address is ONE span. City = a
// Capitalised run (hyphens/apostrophes ok). A dash between street and postal is
// tolerated ("… Grande Armée - 93360 NEUILLY-PLAISANCE" — the letterhead form).
// ⚠️ The postal-code → city separator is `[,\s]+`, not `\s+`: the FORM writes
// « 2 mail Camille du Gast, 92600, Asnières », and on that comma the whole tail
// detached. Measured on 16/08/2026 on a REAL lease and its REAL amendment — the result was the
// worst of both worlds: the STREET went out fake while the postal code AND the city
// stayed TRUE, exactly the geographic incoherence this tail exists to
// prevent, and a real address reconstructible down to one digit. This is the SAME class as
// the street → postal-code join just above, which already admits the comma.
export const CITY = "\\p{Lu}[\\p{L}'’.\\- ]{1,28}";
// ⚠️ `MONEY_AHEAD` HERE TOO, and for a reason that doesn't show up reading the line:
// these forms are compiled with `giu`, and **under the `i` flag, `\\p{Lu}` matches
// lowercase**. The "capitalised city" that `CITY` thinks it requires therefore requires nothing, and the
// bare `\\d{4}` branch (the BE/CH/AT/LU postal codes) reads « 2400 euros ht pose comprise »
// as "postal code 2400 + city 'euros ht pose comprise'". Measured on a
// tradesman's sentence: the address carried off the AMOUNT of his quote, replaced wholesale by a fake
// address — the price never reached the model.
// The guard refuses to let a number followed by a currency or a tax mention pass for
// a postal code. It does NOT close the general `i`-on-`\\p{Lu}` hole (see the register):
// it closes the measured case, without touching the precision bar of the rest.
export const TAIL_CORE = `[,\\s]+(?:[-–—][,\\s]*)?${MONEY_AHEAD}(?:\\d{5}|\\d{4}-\\d{3}|\\d{4}\\s?[A-Z]{2}|\\d{4})[,\\s]+${CITY}`;
export const TAIL_ZIPCITY = `(?:${TAIL_CORE})?`;
// Trailing "City ST ZIP" (US), "City POSTCODE" (GB), "City PROV A1A 1A1" (CA).
export const EN_POST = "\\d{5}(?:-\\d{4})?|[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d|[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}";
export const TAIL_CITYZIP = `(?:[,\\s]+\\p{Lu}[\\p{L} ]{1,24}(?:,?\\s+[A-Z]{2})?\\s+(?:${EN_POST}))?`;
