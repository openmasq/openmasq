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
// (3) Il doit STOPPER devant un MONTANT. La classe accepte chiffres ET espaces — pour
// « rue du 8 Mai 1945 », qu'on ne peut pas sacrifier — donc sur un texte SANS ponctuation
// elle court jusqu'à son plafond de 38 et emporte ce qui suit la rue. Mesuré sur la phrase
// d'un artisan : « 12 rue des lilas a vitry 2400 euros ht pose comprise » partait en UNE
// zone, remplacée en bloc par une fausse adresse — le montant n'atteignait jamais le
// modèle, et le devis revenait sans prix. `trimAddressTail` ne rattrape pas ce cas : il
// coupe au « code postal + ville », et il n'y a pas de code postal ici.
// Le garde est étroit exprès : aucune voie ne s'appelle « … 2400 euros HT ». Un nombre
// suivi d'une monnaie ou d'une mention de taxe n'est jamais un nom de rue.
export const MONEY_AHEAD = "(?![,\\s]*\\d[\\d  .,]*\\s*(?:€|EUR\\b|euros?\\b|HT\\b|TTC\\b))";
export const NAME =
  `(?:[\\p{L}0-9](?:(?![,\\s]+(?:[-–—][,\\s]*)?\\d{5}\\b)${MONEY_AHEAD}[\\p{L}0-9'’.\\- ]){1,38}[\\p{L}0-9.](?![\\p{L}0-9]))`;

// Trailing "postal City" (FR/ES/IT 5-digit, PT NNNN-NNN, NL "NNNN AB", BE/CH/AT/LU
// 4-digit), optionally consumed so the whole address is ONE span. City = a
// Capitalised run (hyphens/apostrophes ok). A dash between street and postal is
// tolerated ("… Grande Armée - 93360 NEUILLY-PLAISANCE" — the letterhead form).
// ⚠️ Le séparateur code postal → ville est `[,\s]+`, pas `\s+` : le FORMULAIRE écrit
// « 2 mail Camille du Gast, 92600, Asnières », et sur cette virgule la queue entière
// décrochait. Mesuré le 16/08/2026 sur un bail et un avenant RÉELS — le résultat était le
// pire des deux mondes : la RUE partait fausse pendant que le code postal ET la ville
// restaient VRAIS, soit exactement l'incohérence géographique que la queue existe pour
// empêcher, et une adresse réelle reconstituable à un numéro près. C'est la MÊME classe que
// le joint rue → code postal juste avant, qui admet déjà la virgule.
export const CITY = "\\p{Lu}[\\p{L}'’.\\- ]{1,28}";
// ⚠️ `MONEY_AHEAD` ici AUSSI, et pour une raison qui ne se voit pas en lisant la ligne :
// ces formes sont compilées en `giu`, et **sous le drapeau `i`, `\\p{Lu}` matche les
// minuscules**. La « ville capitalisée » que `CITY` croit exiger n'exige donc rien, et la
// branche `\\d{4}` nu (les codes postaux BE/CH/AT/LU) lit « 2400 euros ht pose comprise »
// comme « code postal 2400 + ville "euros ht pose comprise" ». Mesuré sur la phrase d'un
// artisan : l'adresse emportait le MONTANT de son devis, remplacé en bloc par une fausse
// adresse — le prix n'atteignait jamais le modèle.
// Le garde refuse qu'un nombre suivi d'une monnaie ou d'une mention de taxe soit pris pour
// un code postal. Il ne referme PAS le trou général du `i` sur `\\p{Lu}` (voir le registre) :
// il ferme le cas mesuré, sans toucher à la barre de précision du reste.
export const TAIL_CORE = `[,\\s]+(?:[-–—][,\\s]*)?${MONEY_AHEAD}(?:\\d{5}|\\d{4}-\\d{3}|\\d{4}\\s?[A-Z]{2}|\\d{4})[,\\s]+${CITY}`;
export const TAIL_ZIPCITY = `(?:${TAIL_CORE})?`;
// Trailing "City ST ZIP" (US), "City POSTCODE" (GB), "City PROV A1A 1A1" (CA).
export const EN_POST = "\\d{5}(?:-\\d{4})?|[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d|[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}";
export const TAIL_CITYZIP = `(?:[,\\s]+\\p{Lu}[\\p{L} ]{1,24}(?:,?\\s+[A-Z]{2})?\\s+(?:${EN_POST}))?`;
