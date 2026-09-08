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
const LINK = String.raw`(?:[\s:#=.(\[]*[\p{L}'’]{2,12}){0,4}[\s:#=.(\[]*`;

const ID = String.raw`[A-Za-z]{0,6}[-/]?\d[A-Za-z0-9\-/]{2,24}|[A-Za-z]{2,6}\d{3,12}`;

const FAMILIES: CodeFamily[] = [
  {
    // Customer / employee / member / policy / claim / case identifiers — the relationship
    // ids of `CONTRACT_RE`, in the languages the benchmarks write in, and without the colon.
    category: "ID",
    labels: String.raw`customer|client|employee|staff|member|membership|policy|claim|case|file|docket|reference`,
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
    labels: String.raw`(?:account\s+|card\s+)?pin(?:\s+(?:code|number))?|pin-?code|cvv2?|cvc2?|(?:card\s+)?security\s+code|card\s+verification(?:\s+(?:code|value))?|verification\s+code|otp(?:\s+code)?|code\s+pin|cryptogramme(?:\s+visuel)?|c[óo]digo\s+(?:pin|de\s+seguridad|de\s+verificaci[óo]n)|codice\s+(?:pin|di\s+sicurezza|di\s+verifica)|sicherheitscode|kartenpr[üu]fnummer|pincode|pinkod|s[äa]kerhetskod`,
    value: String.raw`\d{3,8}`,
    minDigits: 3,
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

/** Labelled codes in prose (see the file header). Every value is one token, carries the
 *  family's minimum of digits, and is emitted with the family's category. */
export function detectLabeledCodes(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  const push = (value: string, category: string, start: number, minDigits: number) => {
    const v = value.replace(/[\s.,;:)\]]+$/u, "");
    if ((v.match(/\d/g) ?? []).length < minDigits) return;
    // A pure DATE is never a code (« case of 12/05/2024 »), nor is a money amount.
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(v) || /[.,]\d{1,2}$/.test(v)) return;
    const key = `${category}::${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value: v, category, start });
  };
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
      push(value, f.category, start, f.minDigits);
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
