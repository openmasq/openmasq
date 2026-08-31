import type { RedactionRule } from "../../types";
import { gate, re } from "./rules.international.util";
import {
  deTaxIdValid,
  esNieValid,
  esNifValid,
  itVatValid,
  peselValid,
  trNationalIdValid,
  ukNhsValid,
} from "../validators/validators.international";
import {
  atSvnrValid,
  beNnValid,
  beVatValid,
  dkCvrValid,
  plNipValid,
  seVatValid,
  chAvsValid,
  czRcValid,
  dkCprValid,
  grAmkaValid,
  iePpsValid,
  luMatriculeValid,
  nlBsnValid,
  noFnrValid,
  ptNifValid,
} from "../validators/validators.europe";

// European identity schemes ported from presidio-ts. All → "national_id".
// UK NINO is already a built-in rule, so it is not duplicated.
const nid = (pattern: RegExp, validate?: (m: string) => boolean): RedactionRule => ({
  type: "national_id",
  pattern,
  validate,
});
// Company registries / VAT → their own toggle; bank coordinates ride the iban toggle.
const cid = (pattern: RegExp, validate?: (m: string) => boolean): RedactionRule => ({
  type: "company_id",
  pattern,
  validate,
});
const _bank = (pattern: RegExp, validate?: (m: string) => boolean): RedactionRule => ({
  type: "bank_route",
  pattern,
  validate,
});

export const EUROPE_RULES: RedactionRule[] = [
  // Spain — NIF/DNI & NIE, mod-23 letter; passport (3 letters + 6 digits).
  nid(re(String.raw`\b[0-9]?[0-9]{7}[-]?[A-Z]\b`), esNifValid),
  nid(re(String.raw`\b[X-Z][0-9]?[0-9]{7}[-]?[A-Z]\b`), esNieValid),
  // ES passport (3 letters + 6 digits) is a generic code shape → context-gated.
  nid(gate("pasaporte|passport", String.raw`[A-Z]{3}[0-9]{6}`)),
  // Spain — CIF, the COMPANY tax id ("con NIF B12345678"). The person-side NIF/NIE
  // rules above are mod-23 letter-checked and cannot see it: a CIF is a LEADING
  // organisation letter + 7 digits + a control char, so it has no trailing mod-23
  // letter to validate. It is the counterparty id on every Spanish contract, and it
  // shipped in clear. Gated on the scheme keyword (the shape alone is a banal code)
  // and structurally bounded: the leading letter must be a real CIF organisation
  // class (A société anonyme, B S.L., …), which excludes an ordinary word.
  {
    type: "company_id",
    pattern: gate("cif|nif", String.raw`[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]\b`),
  },
  // Spain — NUSS / número de afiliación a la Seguridad Social. The EXACT equivalent of the
  // French NIR, which the engine has always redacted: it appears on every payslip,
  // every contract and every Spanish Seguridad Social document, and no
  // rule saw it — measured on 17/08/2026 on a real nómina in columns, under its
  // own label « Nº Seguridad Social ».
  //
  // GATED BY THE KEYWORD, not by a checksum: the NUSS does have one (mod 97
  // on the body), but no published test vector lets us VERIFY it here, and a check
  // implemented from a description would let through the real numbers it
  // computes wrong — i.e. a leak disguised as a rule. The precision bar
  // covers this case: a banal digit run is gated by the scheme's word.
  // The real-world form is 2 (province) + 7 or 8 (sequence) + 2 (check), separated by
  // space, slash, dot or dash — or glued.
  nid(
    gate(
      // ⚠️ `n.a.f.` is the ABBREVIATION Spanish forms actually use for
      // the número de afiliación — the label spelled out in full is the exception, not the
      // rule. Without it, the gate added that same morning only covered half the
      // documents where the number appears (contract, nómina, alta en la Seguridad Social).
      // No risk on the FRENCH « code NAF » side: that one is 4 digits + a
      // letter (6201Z), which can't satisfy the 11-12 digits required below.
      "seguridad social|n[uú]mero de afiliaci[oó]n|afiliaci[oó]n|nuss|n\\.?\\s?a\\.?\\s?f\\.?",
      String.raw`\d{2}[ /.\-]?\d{7,8}[ /.\-]?\d{2}\b`,
    ),
  ),
  // Germany — Personalausweis / Reisepass (restricted letter set), Steuer-ID
  // (mod 11,10 checksum), Führerschein, Handelsregister, VAT, KVNR (gated).
  // Personalausweis degenerates to consonant+8-digits & Führerschein to 2-letters+
  // 8-digits+alnum — both generic → context-gated. Steuer-ID stays checksum-validated.
  nid(gate("personalausweis|ausweis|reisepass|id card", String.raw`[CFGHJKLMNPRTVWXYZ][CFGHJKLMNPRTVWXYZ0-9]{7}[0-9]`)),
  nid(re(String.raw`\b[1-9]\d{10}\b`), deTaxIdValid),
  nid(gate("führerschein|fuehrerschein|fuhrerschein|driving licen|driver licen", String.raw`[A-Z]{2}\d{8}[A-Z0-9]`)),
  cid(re(String.raw`\bHR[AB]\s*\d{1,6}\b`)),
  // ⚠️ The space after the prefix MUST be tolerated: « USt-IdNr.: DE 123456789 »
  // is a common way German invoices write it, and Germany was the ONLY country
  // in the VAT pack (below) not to accept it — BE/PL/SE/DK/PT/NL/AT/ES/IE all have their
  // ` ?`. So the same number went out in clear or redacted depending on a single space.
  cid(re(String.raw`\bDE ?\d{9}\b`)),
  // The STEUERNUMMER — the other German tax id, and the most frequent one on an
  // invoice: §14 UStG requires one of the two, and a small business without a USt-IdNr writes
  // this one. No rule saw it. Gated by its LABEL, not by a check: the
  // « Land » part is structural and there's no published national checksum —
  // a check written from a description would let through the real numbers
  // it would compute wrong. The two official groupings (10 and 11 digits),
  // with slashes or spaces.
  cid(
    gate(
      "steuernummer|steuer-?nr|st\\.?-?nr",
      String.raw`\d{2,3}[/ ]\d{3}[/ ]\d{4,5}\b`,
    ),
  ),
  nid(gate("versichertennummer|krankenversicherung|kvnr|insurance", String.raw`[A-Z]\d{9}`)),
  // Italy — Partita IVA (Luhn mod-10), driver licence, identity card, passport.
  // The IVA is CONTEXT-GATED: an 11-digit run is a banal shape (a phone with country
  // code, an order id) and Luhn passes ~1/10 of random runs — the weakest checksum in
  // the pack, so bare it redacted ordinary numbers as company_id (data corruption).
  cid(gate("p\\.?\\s?iva|partita\\s?iva|vat|codice", String.raw`([0-9][ _]?){11}`), itVatValid),
  // Driver licence: the `U1…` form is distinctive (kept bare); the `2-letters+7-
  // digits+letter` form is generic → gated.
  nid(re(String.raw`\bU1[BCDEFGHLJKMNPRSTUWYXZ0-9]{7}[A-Z]\b`)),
  nid(gate("patente|driver licen|driving licen|licenza", String.raw`[A-Z]{2}\d{7}[A-Z]`)),
  // Identity card / passport — 2-letters+7-digits (and dashed variants) is a very
  // common code shape → context-gated. (The former bare `\b[A-Z]{2}\d{7}\b` generic-
  // passport rule was REMOVED: fully shadowed by the first alternative here, and it
  // false-positived on any 2-letter+7-digit code.)
  nid(gate("carta d'identità|carta identita|identity card|passport|passaporto", String.raw`[A-Z]{2}\s?\d{7}|\d{7}[A-Z]{2}|[A-Z]{2}\d{5}[A-Z]{2}`)),
  // Poland — PESEL (encodes a valid date + weighted checksum).
  nid(
    re(String.raw`\b[0-9]{2}([02468][1-9]|[13579][012])(0[1-9]|1[0-9]|2[0-9]|3[01])[0-9]{5}\b`),
    peselValid,
  ),
  // Finland — henkilötunnus. The separator class includes `-`/`+`, so the shape
  // degenerates to `\d{6}-\d{4}` and matched ordinary formatted numbers (`123456-7890`)
  // → context-gated.
  nid(gate("hetu|henkilötunnus|henkilotunnus|social security", String.raw`\d{6}[-+ABCDEFYXWVU]\d{3}[0123456789ABCDEFHJKLMNPRSTUVWXY]`)),
  // Sweden — personnummer / organisationsnummer are bare digit runs → gated.
  nid(gate("personnummer|personal number|födelsenummer", String.raw`\d{6,8}[-+]?\d{4}`)),
  cid(gate("organisationsnummer|orgnr|org nr|företagsnummer", String.raw`\d{6}[-]?\d{4}`)),
  // United Kingdom — NHS (mod-11), driving licence, vehicle registration.
  // The SPACED/dashed 3-3-4 form is distinctive → fires on the checksum alone; a
  // BARE 10-digit run is NOT (Unix timestamps, Stripe/DB ids… satisfy the weak
  // mod-11 ~1 time in 11), so require a separator OR an "nhs" context word. Without
  // this a JSON `"created": 2520525167` got redacted and CORRUPTED the model's date
  // math — irreversibly, since the model re-derives the date from the (fake) number.
  nid(re(String.raw`\b([0-9]{3})[- ]([0-9]{3})[- ]([0-9]{4})\b`), ukNhsValid),
  nid(gate("nhs|national health|nhs number|nhs no", String.raw`\d{10}\b`), ukNhsValid),
  nid(
    re(
      String.raw`\b[A-Z9]{5}[0-9](?:0[1-9]|1[0-2]|5[1-9]|6[0-2])(?:0[1-9]|[12][0-9]|3[01])[0-9][A-Z9]{2}[A-Z0-9][A-Z]{2}\b`,
    ),
  ),
  nid(re(String.raw`\b[A-HJ-PR-Y][A-HJ-PR-Y](?:0[1-9]|[1-7][0-9])[- ]?[A-HJ-PR-Z]{3}\b`)),
  // Turkey — T.C. Kimlik No (two check digits). The licence plate (province +
  // letters + digits) is too loose to fire on shape (matches e.g. "15T10" in a
  // timestamp) → context-gated.
  nid(re(String.raw`\b[1-9][0-9]{10}\b`), trNationalIdValid),
  nid(
    gate(
      "plaka|plate|license plate|licence plate|araç",
      String.raw`(0[1-9]|[1-7][0-9]|8[0-1])\s?[A-PR-VY-Z]{1,3}\s?\d{2,4}`,
    ),
  ),
  // ── Beyond the presidio port ──────────────────────────────────────────────
  // Belgium — registre national (YY.MM.DD-SSS.CC, mod-97 like the IBAN's) →
  // checksum-validated, fires bare (dotted or glued).
  nid(re(String.raw`\b\d{2}[. ]?\d{2}[. ]?\d{2}[- .]?\d{3}[. ]?\d{2}\b`), beNnValid),
  // Switzerland — AVS/AHV: the `756` prefix is world-unique + EAN-13 → bare.
  nid(re(String.raw`\b756[. ]?\d{4}[. ]?\d{4}[. ]?\d{2}\b`), chAvsValid),
  // Luxembourg — matricule (YYYYMMDD + order + checks): date + Luhn → bare.
  nid(re(String.raw`\b(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{5}\b`), luMatriculeValid),
  // Luxembourg — RCS number ("RCS Luxembourg B 61 227", the FR-caution-act footer):
  // a bare `B \d+` is a postal box / bus line, so the registry keyword gates it.
  cid(gate("rcs luxembourg|rcs lux", String.raw`B[ ]?\d{2,3}(?:[ .]?\d{3})?\b`)),
  // France — ORIAS insurance-intermediary number (8 digits, "07 042 385"): banal
  // shape → gated on the register's name or the prose it appears in ("immatriculée
  // au Registre des Intermédiaires en Assurance sous le numéro …").
  cid(gate("orias|intermédiaires en assurance sous le numéro|intermediaires en assurance sous le numero", String.raw`\d{2}[ ]?\d{3}[ ]?\d{3}\b`)),
  // France — IDU (identifiant unique REP/CITEO, "FR194628_01ZVJG"): the country
  // prefix + fixed digit/underscore structure is distinctive enough to fire bare.
  cid(re(String.raw`\bFR\d{6}_\d{2}[A-Z0-9]{4}\b`)),
  // Netherlands — BSN: bare 9 digits is banal and 11-proof is only 1/11 → gated + validated.
  nid(gate("bsn|burgerservicenummer|sofinummer|sofi", String.raw`\d{9}\b`), nlBsnValid),
  // Portugal — NIF: same reasoning (9 digits, mod-11) → gated + validated.
  nid(gate("nif|contribuinte|fiscal number", String.raw`\d{9}\b`), ptNifValid),
  // Ireland — PPS: 7 digits + letter reads like a ref code → gated + mod-23 validated.
  nid(gate("pps|personal public service", String.raw`\d{7}[A-Wa-w]{1,2}\b`), iePpsValid),
  // Norway — fødselsnummer: date prefix + TWO mod-11 checks (~1/121) → bare.
  nid(re(String.raw`\b\d{11}\b`), noFnrValid),
  // Czechia/Slovakia — rodné číslo: the SLASHED form is distinctive; mod-11 + month
  // rules validated. (The glued form stays uncovered — a bare 9/10-digit run is banal.)
  nid(re(String.raw`\b\d{6}/\d{3,4}\b`), czRcValid),
  // Austria — SVNR (SSSC DDMMYY): banal 4+6 digits → gated + weighted check.
  nid(gate("svnr|sozialversicherungsnummer|versicherungsnummer", String.raw`\d{4}[ ]?\d{6}\b`), atSvnrValid),
  // Greece — AMKA (DDMMYY + 5): banal 11 digits → gated + date/Luhn validated.
  nid(gate("amka|αμκα", String.raw`\d{11}\b`), grAmkaValid),
  // Denmark — CPR (DDMMYY-SSSS): the checksum was abandoned in 2007, so structure
  // only → gated (the dashed 6-4 shape alone matched ordinary formatted numbers).
  nid(gate("cpr|personnummer", String.raw`\d{6}-\d{4}\b`), dkCprValid),
  // United Kingdom — passport (9 digits) and UTR (10 digits): banal runs → gated.
  nid(gate("passport", String.raw`\d{9}\b`)),
  nid(gate("utr|unique taxpayer reference", String.raw`\d{10}\b`)),
  // ── License plates (GDPR personal data; only TR/NG/IN/UK were covered) ────
  // FR SIV ("AA-123-BB") and old FNI ("123 ABC 75"), DE ("B-AB 1234"): dashed/spaced
  // letter-digit groups collide with reference codes → gated on vehicle context.
  nid(
    gate(
      "plaque|immatriculation|immatricul[ée]e?|v[ée]hicule|voiture|camion|moto|scooter|kennzeichen|fahrzeug",
      String.raw`[A-Za-z]{2}-\d{3}-[A-Za-z]{2}\b|\d{1,4} ?[A-Za-z]{2,3} ?\d{2,3}\b|[A-ZÄÖÜa-zäöü]{1,3}-[A-Za-z]{1,2} ?\d{1,4}\b`,
    ),
  ),
  // ── EU VAT pack (FR/DE/IT already covered) — the COUNTRY-PREFIXED written forms
  // are distinctive, and BE/PL/SE/DK/PT add their official checksums → bare.
  cid(re(String.raw`\bBE ?0\d{9}\b`), beVatValid),
  cid(re(String.raw`\bPL ?\d{10}\b`), plNipValid),
  // …and the NATIONAL writing, keyword-gated: a Polish invoice says « NIP:
  // 113-245-678-9 » with no PL prefix, and the country-prefixed rule above never
  // sees it. Same mod-11 checksum carries the precision; dashes tolerated in the
  // two official groupings (3-3-2-2 and 3-2-2-3).
  cid(gate("nip", String.raw`\d{3}[- ]?\d{2,3}[- ]?\d{2}[- ]?\d{2,3}\b`), plNipValid),
  cid(re(String.raw`\bSE ?\d{12}\b`), seVatValid),
  cid(re(String.raw`\bDK ?\d{2} ?\d{2} ?\d{2} ?\d{2}\b`), dkCvrValid),
  cid(re(String.raw`\bPT ?\d{9}\b`), ptNifValid),
  // Structural only (no public checksum): NL, AT, ES, IE.
  cid(re(String.raw`\bNL ?\d{9} ?B ?\d{2}\b`)),
  cid(re(String.raw`\bATU ?\d{8}\b`)),
  cid(re(String.raw`\bES ?[A-Z]\d{7}[A-Z0-9]\b`)),
  cid(re(String.raw`\bIE ?\d[A-Z0-9+*]\d{5}[A-Z]{1,2}\b`)),
];
