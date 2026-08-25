// European checksummed schemes. Every `is` reuses the ENGINE validator; every
// `fake` repairs its check position(s) against that SAME validator (`repair`),
// so generation and detection can never disagree on validity.
import {
  deTaxIdValid,
  esNieValid,
  esNifValid,
  itVatValid,
  peselValid,
  trNationalIdValid,
  ukNhsValid,
} from "../../../engine/validators/validators.international";
import {
  atSvnrValid,
  beNnValid,
  beVatValid,
  chAvsValid,
  czRcValid,
  dkCprValid,
  dkCvrValid,
  grAmkaValid,
  iePpsValid,
  luMatriculeValid,
  nlBsnValid,
  noFnrValid,
  plNipValid,
  ptNifValid,
  seVatValid,
} from "../../../engine/validators/validators.europe";
import { AZ, draw, fakeDMY, p2, p3, repair, repairLast } from "./helpers";
import type { IdScheme } from "./types";

const last2 = (s: string) => [
  { i: s.length - 2, cs: "0123456789" },
  { i: s.length - 1, cs: "0123456789" },
];

export const EUROPE_SCHEMES: IdScheme[] = [
  {
    id: "be_nn",
    cat: "national_id",
    is: (c) => /^\d{11}$/.test(c) && beNnValid(c),
    fake: (c, rng) => {
      const { d, m, y } = fakeDMY(rng);
      const base = y + m + d + p3(1 + rng(996));
      return base + p2(97 - (Number(base) % 97));
    },
  },
  {
    id: "ch_avs",
    cat: "national_id",
    is: (c) => /^\d{13}$/.test(c) && chAvsValid(c),
    // The 756 country prefix is a spec CONSTANT, not identity — kept.
    fake: (c, rng) => repairLast("756" + draw(rng, 10), chAvsValid),
  },
  {
    id: "lu_matricule",
    cat: "national_id",
    is: (c) => /^\d{13}$/.test(c) && luMatriculeValid(c),
    fake: (c, rng) => {
      const { d, m } = fakeDMY(rng);
      const body = String(1940 + rng(66)) + m + d + p3(1 + rng(998));
      return repair(body + "00", [{ i: 11, cs: "0123456789" }, { i: 12, cs: "0123456789" }], luMatriculeValid);
    },
  },
  {
    id: "nl_bsn",
    cat: "national_id",
    is: (c) => /^\d{9}$/.test(c) && nlBsnValid(c),
    fake: (c, rng) => repairLast(draw(rng, 9), nlBsnValid),
  },
  {
    id: "pt_nif",
    cat: "national_id",
    // First digit encodes the taxpayer TYPE — a derived attribute, kept.
    is: (c) => /^[1235689]\d{8}$/.test(c) && ptNifValid(c),
    fake: (c, rng) => repairLast(c[0] + draw(rng, 8), ptNifValid),
  },
  {
    id: "ie_pps",
    cat: "national_id",
    is: (c) => /^\d{7}[A-W]{1,2}$/i.test(c) && iePpsValid(c),
    // The optional 2nd (range) letter is kept; the check letter is repaired.
    fake: (c, rng) => repair(draw(rng, 7) + c.slice(7), [{ i: 7, cs: AZ.slice(0, 23) }], iePpsValid),
  },
  {
    id: "no_fnr",
    cat: "national_id",
    is: (c) => /^\d{11}$/.test(c) && noFnrValid(c),
    fake: (c, rng) => {
      const { d, m, y } = fakeDMY(rng);
      return repair(d + m + y + p3(1 + rng(998)) + "00", last2(c), noFnrValid);
    },
  },
  {
    id: "cz_rc",
    cat: "national_id",
    // 10-digit form ONLY: `czRcValid` accepts ANY 9-digit run (pre-1954 has no
    // check digit), which would let this scheme claim every 9-digit id.
    is: (c) => /^\d{10}$/.test(c) && czRcValid(c),
    fake: (c, rng) => {
      const { d, m, y } = fakeDMY(rng);
      const mm = rng(2) ? p2(Number(m) + 50) : m; // women: month + 50
      return repairLast(y + mm + d + p3(1 + rng(998)) + "0", czRcValid);
    },
  },
  {
    id: "at_svnr",
    cat: "national_id",
    // One weighted check over 10 banal digits — require the national SSSC DDMMYY
    // layout (glued, or one space after the 4-digit serial block).
    is: (c, raw) =>
      /^\d{10}$/.test(c) && (raw === undefined || /^\d{4}\s?\d{6}$/.test(raw.trim())) && atSvnrValid(c),
    fake: (c, rng) => {
      const { d, m, y } = fakeDMY(rng);
      return repair(p3(100 + rng(900)) + "0" + d + m + y, [{ i: 3, cs: "0123456789" }], atSvnrValid);
    },
  },
  {
    id: "gr_amka",
    cat: "national_id",
    is: (c) => /^\d{11}$/.test(c) && grAmkaValid(c),
    fake: (c, rng) => {
      const { d, m, y } = fakeDMY(rng);
      return repairLast(d + m + y + draw(rng, 4) + "0", grAmkaValid);
    },
  },
  {
    id: "dk_cpr",
    cat: "national_id",
    structural: true, // the mod-11 was abandoned in 2007 — a valid date suffices
    is: (c) => /^\d{10}$/.test(c) && dkCprValid(c),
    fake: (c, rng) => {
      const { d, m } = fakeDMY(rng);
      return d + m + draw(rng, 6);
    },
  },
  {
    id: "pl_pesel",
    cat: "national_id",
    is: (c) => /^\d{11}$/.test(c) && peselValid(c),
    // The month field encodes the CENTURY (+20/+40/…) — the original's offset is
    // kept so the fake stays in the same era; day/serial are redrawn.
    fake: (c, rng) => {
      const offset = Math.floor(Number(c.slice(2, 4)) / 20) * 20;
      const { d, y } = fakeDMY(rng);
      return repairLast(y + p2(offset + 1 + rng(12)) + d + draw(rng, 4) + "0", peselValid);
    },
  },
  {
    id: "es_nif",
    cat: "national_id",
    is: (c) => /^\d{7,8}[A-Z]$/i.test(c) && esNifValid(c),
    fake: (c, rng) => repair(draw(rng, c.length - 1) + "A", [{ i: c.length - 1, cs: AZ }], esNifValid),
  },
  {
    id: "es_nie",
    cat: "national_id",
    is: (c) => /^[XYZ]\d{7}[A-Z]$/i.test(c) && esNieValid(c),
    fake: (c, rng) => repair(c[0].toUpperCase() + draw(rng, 7) + "A", [{ i: 8, cs: AZ }], esNieValid),
  },
  {
    id: "de_taxid",
    cat: "national_id",
    is: (c) => /^[1-9]\d{10}$/.test(c) && deTaxIdValid(c),
    fake: (c, rng) => repairLast(String(1 + rng(9)) + draw(rng, 10), deTaxIdValid),
  },
  {
    id: "uk_nhs",
    cat: "national_id",
    is: (c) => /^\d{10}$/.test(c) && ukNhsValid(c),
    fake: (c, rng) => repairLast(draw(rng, 10), ukNhsValid),
  },
  {
    id: "uk_nino",
    cat: "national_id",
    // Structural: the rule's own letter classes. The A-D suffix (which payroll
    // systems key on) is kept.
    is: (c) => /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(c),
    fake: (c, rng) => {
      const CS = "ABCEGHJKLMNPRSTWXYZ";
      return CS[rng(CS.length)] + CS[rng(CS.length)] + draw(rng, 6) + c[8];
    },
  },
  {
    id: "tr_id",
    cat: "national_id",
    is: (c) => /^[1-9]\d{10}$/.test(c) && trNationalIdValid(c),
    fake: (c, rng) => repair(String(1 + rng(9)) + draw(rng, 8) + "00", last2(c), trNationalIdValid),
  },
  // ── Company registries / VAT ──────────────────────────────────────────────
  {
    id: "it_vat",
    cat: "company_id",
    is: (c) => /^(?:IT)?\d{11}$/i.test(c) && itVatValid(c),
    fake: (c, rng) => {
      const p = /^it/i.test(c) ? c.slice(0, 2) : "";
      return repairLast(p + draw(rng, 10) + "0", (s) => itVatValid(s.slice(p.length)));
    },
  },
  {
    id: "be_vat",
    cat: "company_id",
    is: (c) => /^BE[01]\d{9}$/i.test(c) && beVatValid(c),
    fake: (c, rng) => {
      const first8 = c[2] + draw(rng, 7); // keep the 0/1 era digit
      return c.slice(0, 2) + first8 + p2(97 - (Number(first8) % 97));
    },
  },
  {
    id: "pl_nip",
    cat: "company_id",
    is: (c) => /^(?:PL)?\d{10}$/i.test(c) && plNipValid(c),
    fake: (c, rng) => {
      const p = /^pl/i.test(c) ? c.slice(0, 2) : "";
      return repairLast(p + draw(rng, 9) + "0", (s) => plNipValid(s.slice(p.length)));
    },
  },
  {
    id: "se_vat",
    cat: "company_id",
    is: (c) => /^(?:SE)?\d{12}$/i.test(c) && seVatValid(c),
    fake: (c, rng) => {
      const p = /^se/i.test(c) ? c.slice(0, 2) : "";
      return repair(p + draw(rng, 9) + "001", [{ i: p.length + 9, cs: "0123456789" }], (s) =>
        seVatValid(s.slice(p.length)),
      );
    },
  },
  {
    id: "dk_cvr",
    cat: "company_id",
    is: (c) => /^(?:DK)?\d{8}$/i.test(c) && dkCvrValid(c),
    fake: (c, rng) => {
      const p = /^dk/i.test(c) ? c.slice(0, 2) : "";
      return repairLast(p + draw(rng, 7) + "0", (s) => dkCvrValid(s.slice(p.length)));
    },
  },
  {
    id: "pt_vat",
    cat: "company_id",
    is: (c) => /^PT[1235689]\d{8}$/i.test(c) && ptNifValid(c.slice(2)),
    fake: (c, rng) => {
      const f = repairLast(c[2] + draw(rng, 8), ptNifValid);
      return f ? c.slice(0, 2) + f : null;
    },
  },
];
