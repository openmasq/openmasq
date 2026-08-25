// Americas checksummed schemes — same contract as europe.ts (engine validators
// for `is`, `repair` against the same validator for the check positions).
import {
  abaRoutingValid,
  caSinValid,
  usNpiValid,
} from "../../../engine/validators/validators.international";
import {
  arCuitValid,
  brCnpjValid,
  brCpfValid,
  clRutValid,
  mxClabeValid,
  mxCurpValid,
} from "../../../engine/validators/validators.world";
import { AZ, draw, fakeDMY, repair, repairLast } from "./helpers";
import type { IdScheme } from "./types";

const D = "0123456789";
const last2 = (s: string) => [
  { i: s.length - 2, cs: D },
  { i: s.length - 1, cs: D },
];

/** US SSN — no checksum exists; the fake respects the ISSUED ranges the engine's
 *  `ssnValid` structural filter enforces (area ≠ 000/666/9xx, group ≠ 00,
 *  serial ≠ 0000) so it reads as a real allocation. */
function makeSsn(rng: (n: number) => number): string {
  let area = 1 + rng(899);
  if (area === 666) area = 667;
  return String(area).padStart(3, "0") + String(1 + rng(99)).padStart(2, "0") + String(1 + rng(9999)).padStart(4, "0");
}

export const AMERICAS_SCHEMES: IdScheme[] = [
  {
    id: "us_npi",
    cat: "national_id",
    // BEFORE the generic SSN shape: NPI is 10 digits with a real Luhn.
    is: (c) => /^[12]\d{9}$/.test(c) && usNpiValid(c),
    fake: (c, rng) => repairLast(c[0] + draw(rng, 9), usNpiValid),
  },
  {
    id: "ca_sin",
    cat: "national_id",
    is: (c) => /^[1-79]\d{8}$/.test(c) && caSinValid(c),
    fake: (c, rng) => repairLast(c[0] + draw(rng, 8), caSinValid),
  },
  {
    id: "br_cpf",
    cat: "national_id",
    is: (c) => /^\d{11}$/.test(c) && brCpfValid(c),
    fake: (c, rng) => repair(draw(rng, 9) + "00", last2(c), brCpfValid),
  },
  {
    id: "br_cnpj",
    cat: "company_id",
    is: (c) => /^\d{14}$/.test(c) && brCnpjValid(c),
    // Positions 8-11 are the BRANCH ("0001" for a head office) — kept verbatim.
    fake: (c, rng) => repair(draw(rng, 8) + c.slice(8, 12) + "00", last2(c), brCnpjValid),
  },
  {
    id: "cl_rut",
    cat: "national_id",
    // ONE mod-11 over a banal 8-9 digit run — require the national LAYOUT (the
    // DV set off by a dash/dot, as every Chilean writing has it), else this
    // scheme claims a third of the world's spaced 9-digit ids.
    is: (c, raw) =>
      /^\d{7,8}[0-9K]$/i.test(c) && (raw === undefined || /[.-]\s?[0-9K]$/i.test(raw)) && clRutValid(c),
    fake: (c, rng) =>
      repair(draw(rng, c.length - 1) + "0", [{ i: c.length - 1, cs: D + "K" }], clRutValid),
  },
  {
    id: "ar_cuit",
    cat: "national_id",
    // The 2-digit prefix encodes person vs company — a derived attribute, kept.
    is: (c) => /^(?:2[03457]|3[034])\d{9}$/.test(c) && arCuitValid(c),
    fake: (c, rng) => repairLast(c.slice(0, 2) + draw(rng, 8) + "0", arCuitValid),
  },
  {
    id: "mx_curp",
    cat: "national_id",
    is: (c) => mxCurpValid(c),
    // Letters are the holder's INITIALS — scrambled; the sex marker [HM] and the
    // state code style are structural and re-drawn/kept valid.
    fake: (c, rng) => {
      const { d, m, y } = fakeDMY(rng);
      const cand = draw(rng, 4, AZ) + y + m + d + c[10] + draw(rng, 5, AZ) + draw(rng, 1, AZ + D) + "0";
      return repairLast(cand, mxCurpValid);
    },
  },
  {
    id: "mx_clabe",
    cat: "bank_route",
    is: (c) => /^\d{18}$/.test(c) && mxClabeValid(c),
    fake: (c, rng) => repairLast(draw(rng, 17) + "0", mxClabeValid),
  },
  {
    id: "us_aba",
    cat: "bank_route",
    // The leading digit stays in the FRB's issued classes (the rule's own set).
    is: (c) => /^[0-36-8]\d{8}$/.test(c) && abaRoutingValid(c),
    fake: (c, rng) => repairLast(c[0] + draw(rng, 7) + "0", abaRoutingValid),
  },
  {
    id: "us_ssn",
    cat: "national_id",
    structural: true, // no checksum exists — only reached when no checksummed
    // scheme recognised the original (the dispatcher orders structural LAST).
    is: (c) => {
      if (!/^\d{9}$/.test(c)) return false;
      const area = Number(c.slice(0, 3));
      return area > 0 && area !== 666 && area < 900 && Number(c.slice(3, 5)) > 0 && Number(c.slice(5)) > 0;
    },
    fake: (c, rng) => makeSsn(rng),
  },
];
