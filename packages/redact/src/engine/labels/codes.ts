// Labelled CODES without a colon — the conversational and legal idioms the `label : value`
// detector cannot see, anchored on the VALUE token rather than on a separator.
//
//   « my employee ID is EMP669456 »   « the account pin 6296 »   « Passport No. X12345678 »
//   « bank routing number 611413578 » « an application (no. 36110/97) against Turkey »
//
// Same doctrine as `contextFields.numbers.ts` (which owns the account / fiscal / contract
// number families) and the same precision bar as the rules: a bare token is never a rule on
// its own — here the LABEL is the proof, so every family names its label words explicitly,
// the value is ONE token, and each family says what shape that token must have. Measured on
// 2026-09-07 (`bench/spans/`): customer/employee ids at 26 %, PINs at 8 %, routing numbers
// at 11 %, court-case numbers at 0 % — every one written next to its label, in prose.
import type { Detection } from "../../types";

interface CodeFamily {
  category: string;
  /** Label words (regex alternation, case-insensitive). */
  labels: string;
  /** The label is a plain noun (« customer », « application ») and only becomes a label with
   *  an explicit « number / no. / n° / id » MARK after it — « customer 2024 » is a year,
   *  « customer number 2024 » is an id. Compound-noun labels (« Kundennummer », « SSN ») and
   *  the secrets carry the mark in the word itself and leave this unset. */
  needMark?: boolean;
  /** The value token (regex, no capture groups). Must carry a digit — enforced below. */
  value: string;
  /** Minimum digits in the value — a year or a count is never one of these. */
  minDigits: number;
  /** A last word on the value the pattern cannot say (it compiles case-insensitively). */
  check?: (value: string) => boolean;
}

// Between the label and the value: an optional « number / no. / nr / n° / # », a colon or
// dash, and up to three short LINKING words (« is », « est », « of », « was ») — the
// conversational idiom. Letters only and bounded, so a label's authority never crosses a
// clause (the `gate()` filler rule of `rules.international.util.ts`, in miniature).
const MARK = String.raw`[\s_-]*\(?\s*(?:number|numbers|no|nos|nr|num|n[°ºo]|id|ref|reference)\.?\s*\)?(?:\s*[-–—]\s*)?`;
// Then up to three short LINKING words (« is », « de la remitente », « for this card is »)
// — letters only, bounded, so a label's authority never crosses a clause.
// Linking words are ≥ 2 letters and never dash-joined: a letter or two before a dash is
// the PREFIX of the code (« P-468633-I », « Nm-80877 »), not a word — and « a » before an
// identifier is not how anyone writes. The dash lives in `MARK` (« ID - 123 ») only.
// The COMMA joins the punctuation: « your credit debit card number, 4759 2348 1857 6980, »
// and « the biometric identifier, BIO-4987253610, » are the appositive idiom of a formal
// letter (Nemotron-PII, 2026-09-07). It cannot bridge a value: a digit run is not a word.
// So do the closing paren and the emphasis: « Social Security Number (SSN) is 463-36-4052 »,
// « The **SSN** 415-84-6016 » — a parenthesised acronym and a bold label are prose too.
const LINK = String.raw`(?:[\s:#=.,()\[\]*]*[\p{L}'’]{2,12}){0,4}[\s:#=.,()\[\]*]*`;

const ID = String.raw`[A-Za-z]{0,6}[-/]?\d[A-Za-z0-9\-/]{2,24}|[A-Za-z]{2,6}\d{3,12}`;
// A PREFIXED code — « WA-ENG-721594 », « AET-7895-3214-19 », « BIO-4987253610 », « MRN-345621 »,
// « 23MAR26-LIC124 », a UUID — one or two letter groups, then the digits, up to 40 characters.
// Its label is a compound noun (« medical record number ») that is a label on its own, so
// the plain-noun `needMark` rule does not apply; the digit floor still does.
const PREFIXED = String.raw`(?:[A-Za-z]{1,6}-){0,2}\d[A-Za-z0-9\-/]{2,40}|[A-Za-z]{1,6}-?\d[A-Za-z0-9\-/]{2,40}|\d{3,4}(?:\s\d{3,4}){1,4}(?:\s[A-Z]{1,3})?`;
// A card number under a card label needs no checksum (the label is the second anchor the
// bare rule lacks): four groups of four, the 15-digit Amex grouping, or a bare 13-19 run.
const CARD = String.raw`\d{4}(?:[ -]?\d{4}){3}|\d{4}[ -]?\d{6}[ -]?\d{5}|\d{13,19}`;

const FAMILIES: CodeFamily[] = [
  {
    // Customer / employee / member / policy / claim / case identifiers — the relationship
    // ids of `CONTRACT_RE`, in the languages the benchmarks write in, and without the colon.
    category: "ID",
    labels: String.raw`customer|client|cliente|kunde|klant|employee|staff|member|membership|policy|claim|case|file|docket|reference`,
    needMark: true,
    value: ID,
    minDigits: 3,
  },
  {
    category: "ID",
    labels: String.raw`kundennummer|kunden-?nr|mitarbeiternummer|personalnummer|vertragsnummer|aktenzeichen|n[úu]mero\s+de\s+(?:cliente|empleado|p[óo]liza|expediente)|codice\s+cliente|numero\s+(?:cliente|dipendente|di\s+polizza|polizza|pratica)|klantnummer|personeelsnummer|polisnummer|dossiernummer|kundnummer|ärendenummer`,
    value: ID,
    minDigits: 3,
  },
  {
    // Identity documents named in prose: « passport number 635406038 », « Número de
    // pasaporte de la remitente: 218960794 », « driver's license O42-9680-311-04 ».
    category: "ID",
    labels: String.raw`passports?(?:\s+(?:number|no))?|passeport|pasaporte|passaporto|paspoort(?:nummer)?|reisepass(?:nummer)?|driver'?s?\s+licen[cs]e|driving\s+licen[cs]e|licencia\s+de\s+conducir|patente\s+di\s+guida|rijbewijs(?:nummer)?|führerschein(?:nummer)?|f[öo]rerkort|k[öo]rkort(?:snummer)?|national\s+id(?:entity)?(?:\s+(?:number|card))?|id\s+card(?:\s+number)?|identity\s+card(?:\s+number)?|social\s+security(?:\s+(?:number|no))?|ssn|social\s+insurance\s+number|national\s+insurance\s+number|nino|tax\s+id(?:entification)?(?:\s+number)?|tin`,
    value: String.raw`\d{3}-\d{2}-\d{4}|\d{3}\s\d{2}\s\d{4}|[A-Za-z]{0,3}[-\s]?\d[A-Za-z0-9\-]{4,20}|[A-Za-z]{2}\d{6,9}|[A-Za-z]\d{7,9}`,
    minDigits: 5,
  },
  {
    // Bank coordinates: routing / ABA / sort code / BSB / transit / BBAN / account.
    category: "BANK_ROUTE",
    labels: String.raw`(?:bank\s+)?routing(?:\s+(?:number|no|transit\s+number))?|aba(?:\s+(?:routing\s+)?number)?|rtn|sort\s+code|bsb(?:\s+number)?|transit(?:\s+number)|bban|bank\s+account(?:\s+(?:number|no))?|account\s+(?:number|no)|n[úu]mero\s+de\s+(?:ruta|cuenta)|num[ée]ro\s+de\s+routage|bankleitzahl|blz|kontonummer|rekeningnummer|kontonr`,
    value: String.raw`[A-Za-z]{0,4}\d[\d\-\s]{5,30}\d`,
    minDigits: 6,
  },
  {
    // The numeric secrets: PIN, CVV/CVC, verification code — 3 to 8 digits, whose label is
    // the ONLY thing that separates them from a page number.
    category: "SECRET",
    labels: String.raw`(?:account\s+|card\s+)?pin(?:\s+(?:code|number))?|pin-?code|puk(?:\s+code)?|cvv2?|cvc2?|(?:card\s+)?security\s+code|card\s+verification(?:\s+(?:code|value))?|verification\s+code|otp(?:\s+code)?|code\s+pin|cryptogramme(?:\s+visuel)?|c[óo]digo\s+(?:pin|de\s+seguridad|de\s+verificaci[óo]n)|codice\s+(?:pin|di\s+sicurezza|di\s+verifica)|sicherheitscode|kartenpr[üu]fnummer|pincode|pinkod|s[äa]kerhetskod`,
    // Up to 20 digits, not 8: « Please use the pin 10733285336267 » is a credential with a
    // badly chosen name, not a different kind of thing — and the LABEL is the gate here, so
    // the length was never what kept a page number out.
    value: String.raw`\d{3,20}`,
    minDigits: 3,
  },
  {
    // The identifiers of HEALTH, LICENSING and DEVICES, in prose — « health plan beneficiary
    // number H19385278-03 », « the certificate license number FL-78523416 was verified »,
    // « the device identifier 7F2A1E8F-9B3D-… ». Measured 2026-09-07 on Nemotron-PII: 4 % to
    // 58 % found, the label present every time.
    category: "ID",
    labels: String.raw`health\s+plan\s+beneficiary(?:\s+number)?|beneficiary\s+(?:number|id)|medical\s+record(?:\s+number)?|mrn|patient\s+(?:number|id)|certificate\s+licen[cs]e\s+number|certificate\s+(?:number|no)|licen[cs]e\s+(?:number|no)|biometric\s+(?:identifier|id)|device\s+(?:identifier|id)|vehicle\s+identification\s+number|licen[cs]e\s+plate|plate\s+number|unique\s+(?:identifier|id)|n[úu]mero\s+de\s+seguro\s+social|seguro\s+social`,
    value: PREFIXED,
    minDigits: 3,
  },
  {
    // A CARD named in prose: « the credit debit card 4738 2956 7821 4538 », « card ending in
    // … », « credit card number, 4759 2348 1857 6980, ». A bare « card » needs its mark
    // (« card 4 » is a hand of cards); « credit card » is a label by itself.
    category: "CARD",
    labels: String.raw`credit\s*/?\s*debit\s+card|credit\s+card|debit\s+card|payment\s+card|bank\s+card|carte\s+(?:bancaire|bleue|de\s+cr[ée]dit)|kreditkarte|tarjeta\s+de\s+cr[ée]dito|carta\s+di\s+credito`,
    value: CARD,
    minDigits: 13,
  },
  {
    category: "CARD",
    labels: String.raw`card`,
    needMark: true,
    value: CARD,
    minDigits: 13,
  },
  {
    // The SWIFT/BIC named in prose — « Swift-BIC-koden för mitt bankkonto är KLXDDEJU541 »,
    // « the BIC is BNPAFRPP ». Letters, so no digit floor: eight or eleven UPPERCASE
    // characters, the first six letters, is the shape (`check`, because the pattern compiles
    // case-insensitively and « swift code is required » must stay prose).
    category: "BIC",
    labels: String.raw`swift(?:[-\s]?bic)?(?:[-\s]?(?:code|koden?|kod|nummer|number))?|bic(?:[-\s]?(?:code|koden?|kod|nummer|number))?`,
    value: String.raw`[A-Za-z]{6}[A-Za-z0-9]{2}(?:[A-Za-z0-9]{3})?`,
    minDigits: 0,
    check: (v) => /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(v),
  },
  {
    // Court and administrative CASE numbers in the ECHR / civil-law form « 36110/97 »,
    // « nos. 43185/98 and 43186/98 » — the applicant's file, which identifies the person
    // for anyone with access to the register. 329 of them in TAB's 127 judgments, 0 found.
    category: "ID",
    labels: String.raw`applications?|requ[êe]tes?|affaires?|cases?|dossiers?|proc[ée]dures?|recours|petitions?|appeals?`,
    needMark: true,
    value: String.raw`\d{2,6}/\d{2,4}`,
    minDigits: 4,
  },
];

const CASE_LIST = /^\d{2,6}\/\d{2,4}$/;

// A PASSWORD named in prose — « Ihr neues Passwort ist m)%l8jQz0C », « use the password
// 'd5knsY6kFR*zn0HyZ@' when you book », « a password of "m(3KSxWyz" ». No digit floor can
// apply (a password is anything), so the idiom is narrower than `LINK`: the value follows the
// label after a copula (« is », « ist », « est », « es », « of »), a colon/comma, a paren, OR
// sits in quotes, OR is the very next token (« the password River99$ ») — never after free
// linking words (« password for user john1 » is a username: the shape test below refuses
// « for », and the value is never looked for beyond it).
const PASSWORD_LABELS = String.raw`passwords?|passwort|kennwort|mot\s+de\s+passe|mdp|contrase[ñn]a|senha|wachtwoord|l[öo]senord|passphrase|pass\s+phrase|passcode`;
const PASSWORD_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${PASSWORD_LABELS})(?:\s+(?:is|ist|est|es|of|was|wird|sera|será|être|be)|\s*[:,=]|\s*\(|\s+(?:[\p{L}]{2,12}\s+){0,3}[\p{L}]{2,12}\s*:(?!\/)|\s+(?:[\p{L}]{2,12}\s+){0,4}(?=["'«‘“])|(?=\s+\S))\s*(?:(["'«‘“])([^\s"'»’”]{6,40})["'»’”]|(?<!["'«])(?=\S{6,40}(?:[\s.,;!?]|$))([^\s"'«»]+))`,
  "giu",
);
/** At least a letter, and a digit or a symbol beside it — a word is never a password. Never a
 *  URL, an e-mail, a placeholder. */
function isPasswordShaped(v: string): boolean {
  if (!/\p{L}/u.test(v) || !/[\p{N}\p{P}\p{S}]/u.test(v)) return false;
  if (/:\/\/|^\/|@.+\.|^\*+$|^[\[({<].*[\])}>]$/u.test(v)) return false;
  return true;
}

/** Labelled codes in prose (see the file header). Every value is one token, carries the
 *  family's minimum of digits, and is emitted with the family's category. */
export function detectLabeledCodes(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  const push = (value: string, category: string, start: number, minDigits: number, check?: (v: string) => boolean) => {
    const v = value.replace(/[\s.,;:)\]]+$/u, "");
    if ((v.match(/\d/g) ?? []).length < minDigits) return;
    if (check && !check(v)) return;
    // A pure DATE is never a code (« case of 12/05/2024 »), nor is a money amount, nor a
    // bare YEAR (« the medical record number was updated in 2023 »).
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(v) || /[.,]\d{1,2}$/.test(v) || /^(?:19|20)\d{2}$/.test(v)) return;
    const key = `${category}::${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value: v, category, start });
  };
  for (const m of text.matchAll(PASSWORD_RE)) {
    const quoted = m[2] !== undefined;
    const raw = (m[2] ?? m[3] ?? "");
    // A bare value keeps its own punctuation but not the sentence's (« m)%l8jQz0C. Bitte »,
    // « N8$kR9mZpY5!. ») — a final stop or comma, and a closing paren that opens nothing.
    const v = quoted ? raw : raw.replace(/[.,;:]+$/u, "").replace(/\)$/u, (c, i, str) => (str.includes("(") ? c : ""));
    if (v.length < 6 || !isPasswordShaped(v)) continue;
    const key = `SECRET::${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: v, category: "SECRET", start: m.index + m[0].length - raw.length - (quoted ? 1 : 0) });
  }
  for (const f of FAMILIES) {
    // The value is bounded on both sides: no letter/digit before, none after — so the
    // label can never take a WORD of the sentence as its code.
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${f.labels})(?:${MARK})${f.needMark ? "" : "?"}${LINK}(?<![\\p{L}\\p{N}])(${f.value})(?![\\p{L}\\p{N}])`,
      "giu",
    );
    for (const m of text.matchAll(re)) {
      const value = m[1] ?? "";
      const start = m.index + m[0].length - value.length;
      push(value, f.category, start, f.minDigits, f.check);
      // « nos. 43185/98 and 43186/98 »: the enumeration after a case number.
      if (CASE_LIST.test(value)) {
        const tail = text.slice(start + value.length, start + value.length + 80);
        for (const e of tail.matchAll(/^(?:\s*(?:,|and|et|&|und|y|e)\s*(\d{2,6}\/\d{2,4}))+/gu)) {
          for (const n of e[0].matchAll(/\d{2,6}\/\d{2,4}/g)) push(n[0], f.category, start + value.length + (n.index ?? 0), f.minDigits);
        }
      }
    }
  }
  return out;
}
