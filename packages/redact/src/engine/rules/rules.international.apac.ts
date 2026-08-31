import type { RedactionRule } from "../../types";
import { gate, re } from "./rules.international.util";
import { thTninValid } from "../validators/validators.international";
import { isEpochMs } from "../validators";
import {
  auAbnValid,
  auAcnValid,
  auMedicareValid,
  auTfnValid,
  cnIdValid,
  hkHkidValid,
  ilIdValid,
  jpMyNumberValid,
  nzIrdValid,
} from "../validators/validators.world";

// Asia-Pacific & Africa identity schemes ported from presidio-ts. All →
// "national_id". Bare numeric schemes with no ported checksum are context-gated.
const nid = (pattern: RegExp, validate?: (m: string) => boolean): RedactionRule => ({
  type: "national_id",
  pattern,
  validate,
});
const cid = (pattern: RegExp, validate?: (m: string) => boolean): RedactionRule => ({
  type: "company_id",
  pattern,
  validate,
});
const bank = (pattern: RegExp, validate?: (m: string) => boolean): RedactionRule => ({
  type: "bank_route",
  pattern,
  validate,
});

export const APAC_RULES: RedactionRule[] = [
  // India — PAN, GSTIN, Voter (EPIC), passport (distinctive shapes); Aadhaar
  // dashed is distinctive, bare 12-digit gated; vehicle registration (lettered).
  // PAN (5 letters + 4 digits + letter) & Voter/EPIC (3 letters + 7 digits) are
  // generic alnum shapes (they matched `hello2024a`, `abc1234567`) → context-gated.
  nid(gate("pan|permanent account number", String.raw`[A-Za-z]{5}[0-9]{4}[A-Za-z]`)),
  cid(re(String.raw`\b(0[1-9]|[1-3][0-7])[A-Za-z0-9]{11}Z[A-Za-z0-9]\b`)),
  nid(gate("voter|epic|electoral", String.raw`[A-Za-z]{3}[0-9]{7}`)),
  // Passport (letter + 7 digits) collapses to a common booking/ticket shape → gated.
  nid(gate("passport|passport no|passport number", String.raw`[A-Z][1-9]\d\s?\d{4}[1-9]`)),
  // Aadhaar has no ported checksum and its 12-digit / 4-4-4-spaced shape collides
  // with card fragments and long numbers, so BOTH forms are context-gated.
  nid(gate("aadhaar|aadhar|uidai", String.raw`[0-9]{4}[- :][0-9]{4}[- :][0-9]{4}|[0-9]{12}`)),
  nid(re(String.raw`\b[A-Z]{2}\d{1}[A-Z]{1,3}(?!0000)\d{4}\b`)),
  nid(re(String.raw`\b[A-Z]{2}\d{2}[A-Z]{1,2}(?!0000)\d{4}\b`)),
  // South Korea — RRN (13-digit birth-date shape) & BRN (3-2-5 dashed) are un-
  // checksummed generic numeric shapes (any valid-MMDD 13-digit run / dashed group)
  // → context-gated. Passport keeps its distinctive letter-prefix shape.
  nid(gate("rrn|resident registration", String.raw`(?<!\d)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(-?)[1-4]\d{6}(?!\d)`)),
  cid(gate("brn|business registration", String.raw`(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)`)),
  nid(re(String.raw`(?<![A-Za-z0-9])[MmSsRrOoDd]\d{3}[A-Za-z]\d{4}(?![0-9])`)),
  // Singapore — NRIC/FIN, UEN (letter suffix makes them distinctive).
  nid(re(String.raw`\b[STFGM][0-9]{7}[A-Z]\b`)),
  // UEN: the `[TSR]…` form is distinctive; the bare 8/9-digit + capital forms matched
  // any `<8-digit-id>A` → keep the distinctive one, context-gate the generic ones.
  cid(re(String.raw`\b[TSR]\d{2}[A-Z]{2}\d{4}[A-Z]\b`)),
  cid(gate("uen|unique entity number", String.raw`\d{8,9}[A-Z]`)),
  // Thailand — TNIN (13 digits, weighted mod-11 checksum). `!isEpochMs`: an epoch-ms
  // timestamp is ALSO a bare 13-digit run and passes the mod-11 ~1/11 — tool-result file
  // revisions were sporadically redacted as "national_id" (log 01/08).
  nid(
    re(String.raw`\b[1-9](?:[134][0-9]|2[0-7]|5[0-8]|[67][01234567]|[89][0123456])\d{10}\b`),
    (m) => thTninValid(m) && !isEpochMs(m),
  ),
  // Australia — ABN / TFN / ACN / Medicare are bare digit runs → gated, AND (beyond
  // the presidio port) their official checksums are now verified so a wrong number
  // after the keyword isn't grabbed; the glued forms are covered too.
  cid(gate("abn|australian business number", String.raw`\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}`), auAbnValid),
  nid(gate("tfn|tax file number", String.raw`\d{3}[ ]?\d{3}[ ]?\d{2,3}`), auTfnValid),
  cid(gate("acn|australian company number", String.raw`\d{3}[ ]?\d{3}[ ]?\d{3}`), auAcnValid),
  nid(gate("medicare", String.raw`[2-6]\d{3}[ ]?\d{5}[ ]?\d{1,2}`), auMedicareValid),
  // South Africa — ID number (embeds birth date), gated (no ported checksum).
  nid(gate("id number|south african id|identity|sa id", String.raw`\d{10}[0-2][89]\d`)),
  // Nigeria — vehicle registration (3 letters + 3 digits + 2 letters is a generic
  // plate/code shape, e.g. `ABC123DE`) → context-gated. Philippines — TIN (gated).
  nid(gate("plate|number plate|vehicle|registration", String.raw`[A-Z]{3}[- ]?\d{3}[A-Z]{2}`)),
  nid(gate("tin|tax identification", String.raw`\d{3}-\d{3}-\d{3}(-\d{3})?`)),
  // ── Beyond the presidio port ──────────────────────────────────────────────
  // China — resident identity card: 17 digits (region + full birth date) + ISO 7064
  // mod-11-2 check char (X allowed) → validated, fires bare.
  nid(
    re(String.raw`\b\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b`),
    cnIdValid,
  ),
  // Hong Kong — HKID: 1-2 letters + 6 digits + check (A=10), typically written with
  // the check in PARENS ("A123456(8)") → validated, fires bare.
  nid(re(String.raw`(?<![A-Za-z0-9])[A-Za-z]{1,2}\d{6}\(?[\dAa]\)?(?![A-Za-z0-9])`), hkHkidValid),
  // Japan — My Number: 12 bare digits are banal → gated + positional mod-11 check.
  nid(gate("my number|マイナンバー|個人番号", String.raw`\d{4}[ ]?\d{4}[ ]?\d{4}`), jpMyNumberValid),
  // Malaysia — MyKad: YYMMDD-PB-###G, the double-dashed date-led form is distinctive.
  nid(re(String.raw`\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-\d{2}-\d{4}\b`)),
  // Indonesia — NIK: 16 bare digits are banal → gated.
  nid(gate("nik|nomor induk kependudukan", String.raw`\d{16}\b`)),
  // Israel — Teudat Zehut: 9 bare digits are banal → gated + Luhn-style check.
  nid(gate("teudat|zehut|israeli id|תעודת זהות|מספר זהות", String.raw`\d{9}\b`), ilIdValid),
  // New Zealand — IRD: 8-9 digits, gated + two-phase mod-11 & range check; NHI (3
  // letters + 4 digits) is a generic code shape → gated too.
  nid(gate("ird", String.raw`\d{2,3}[- ]?\d{3}[- ]?\d{3}`), nzIrdValid),
  nid(gate("nhi|national health index", String.raw`[A-Za-z]{3}\d{4}\b`)),
  // India — IFSC bank code (4 letters + "0" + 6 alnum): the shape reads like any
  // uppercase product code → gated. Australia — BSB (6 digits, dashed or not) → gated.
  bank(gate("ifsc", String.raw`[A-Za-z]{4}0[A-Za-z0-9]{6}\b`)),
  bank(gate("bsb", String.raw`\d{3}-?\d{3}\b`)),
];
