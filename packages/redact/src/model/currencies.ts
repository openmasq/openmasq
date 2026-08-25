/**
 * Currency dictionary — ISO 4217 codes + symbols + common currency NAMES. A
 * currency is NEVER PII, but a small NER/LLM detector over-flags a bare 3-letter
 * code as an ORG/NAME (reported: "EUR" → faked "ASH"), corrupting an amount and
 * making the doc unreadable. `isCurrency` feeds the SAME deny-list gate as
 * `isGenericTerm` (via genericTerms.ts), so every detector — LLM, local BERT NER,
 * and the deterministic pseudonymize choke point — drops a standalone currency.
 *
 * Only a candidate whose ENTIRE value is a currency is dropped, so "1250 EUR" (a
 * number + code) is unaffected — the detector tags "EUR" alone, and THAT is what we
 * spare. Case- AND separator-insensitive, mirroring `isGenericTerm`.
 *
 * FP discipline (this is an ALLOW-list — an entry here is sent to the model in
 * CLEAR): every code/name is unambiguous. A code that lowercases to a common PERSON
 * name is OMITTED so we never suppress a real name — notably `BOB` (Bolivian
 * boliviano → the first name "Bob"). Currency NAMES are limited to the unambiguous
 * ones; `franc`/`mark`/`real`/`rand`/`won`/`lev`/`leu`/`pound`/`crown` are left OUT
 * because they double as given names/surnames (a real person must stay redactable).
 */

// ISO 4217 active codes (lowercase). `bob` deliberately omitted — collides with the
// name "Bob"; the Bolivian boliviano is rarely referenced, a leaked "Bob" is worse.
const ISO_CODES = [
  "aed", "afn", "all", "amd", "ang", "aoa", "ars", "aud", "awg", "azn",
  "bam", "bbd", "bdt", "bgn", "bhd", "bif", "bmd", "bnd", "brl", "bsd",
  "btn", "bwp", "byn", "bzd", "cad", "cdf", "chf", "clp", "cny", "cop",
  "crc", "cup", "cve", "czk", "djf", "dkk", "dop", "dzd", "egp", "ern",
  "etb", "eur", "fjd", "fkp", "gbp", "gel", "ghs", "gip", "gmd", "gnf",
  "gtq", "gyd", "hkd", "hnl", "hrk", "htg", "huf", "idr", "ils", "inr",
  "iqd", "irr", "isk", "jmd", "jod", "jpy", "kes", "kgs", "khr", "kmf",
  "kpw", "krw", "kwd", "kyd", "kzt", "lak", "lbp", "lkr", "lrd", "lsl",
  "lyd", "mad", "mdl", "mga", "mkd", "mmk", "mnt", "mop", "mru", "mur",
  "mvr", "mwk", "mxn", "myr", "mzn", "nad", "ngn", "nio", "nok", "npr",
  "nzd", "omr", "pab", "pen", "pgk", "php", "pkr", "pln", "pyg", "qar",
  "ron", "rsd", "rub", "rwf", "sar", "sbd", "scr", "sdg", "sek", "sgd",
  "shp", "sle", "sos", "srd", "ssp", "stn", "svc", "syp", "szl", "thb",
  "tjs", "tmt", "tnd", "top", "try", "ttd", "twd", "tzs", "uah", "ugx",
  "usd", "uyu", "uzs", "ves", "vnd", "vuv", "wst", "xaf", "xcd", "xof",
  "xpf", "yer", "zar", "zmw", "zwl",
];

// Currency symbols (no case). A NER rarely tags these, but they're cheap to cover.
const SYMBOLS = [
  "€", "$", "£", "¥", "₹", "₽", "₩", "¢", "₴", "₺", "₦", "₱", "₫", "฿",
  "₪", "₡", "₨", "₭", "₮", "₲", "₵", "₸", "₼",
];

// Unambiguous currency NAMES (+ common plurals), lowercase. Omits name-colliding
// words (see the file header) so a real person named "Franc"/"Mark"/… stays redactable.
const NAMES = [
  "euro", "euros", "dollar", "dollars", "yen", "yuan", "renminbi",
  "rupee", "rupees", "sterling", "peso", "pesos", "ruble", "rubles",
  "rouble", "roubles", "dirham", "dirhams", "shekel", "shekels", "zloty",
  "ringgit", "baht", "rupiah", "hryvnia", "dinar", "dinars", "riyal",
  "riyals", "rial", "lira", "krona", "kronor", "krone", "kroner", "koruna",
  "forint", "naira", "taka", "tenge", "kwacha", "birr",
];

const CURRENCIES = new Set<string>([...ISO_CODES, ...SYMBOLS, ...NAMES]);

/** True when `value` is a single currency code / symbol / name (never PII alone).
 *  CASE- and SEPARATOR-insensitive, matching `isGenericTerm` (so "E.U.R" also hits).
 *  Only an exact standalone value is a currency — "1250 EUR" is not passed here as a
 *  whole; the detector tags "EUR" on its own, which is what this spares. */
export function isCurrency(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (CURRENCIES.has(lower)) return true;
  const noSep = lower.replace(/[.\s_'’-]+/g, "");
  return noSep !== lower && CURRENCIES.has(noSep);
}
