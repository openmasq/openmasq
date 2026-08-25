// Asia-Pacific + device/vehicle/entity schemes — same contract as europe.ts.
import { thTninValid } from "../../../engine/validators/validators.international";
import {
  auAbnValid,
  auAcnValid,
  auMedicareValid,
  auTfnValid,
  cnIdValid,
  hkHkidValid,
  ilIdValid,
  jpMyNumberValid,
  leiValid,
  nzIrdValid,
} from "../../../engine/validators/validators.world";
import { iccidValid, imeiValid, vinValid } from "../../../engine/validators/validators.identifiers";
import { luhnCheckDigit, mod97 } from "../primitives";
import { AZ, draw, fakeDMY, p2, repair, repairLast } from "./helpers";
import type { IdScheme } from "./types";

const D = "0123456789";
const last2 = (s: string) => [
  { i: s.length - 2, cs: D },
  { i: s.length - 1, cs: D },
];

export const APAC_SCHEMES: IdScheme[] = [
  {
    id: "cn_id",
    cat: "national_id",
    is: (c) => cnIdValid(c),
    fake: (c, rng) => {
      const { d, m } = fakeDMY(rng);
      const cand = draw(rng, 6) + String(1950 + rng(56)) + m + d + draw(rng, 3) + "0";
      return repair(cand, [{ i: 17, cs: D + "X" }], cnIdValid);
    },
  },
  {
    id: "hk_hkid",
    cat: "national_id",
    is: (c) => hkHkidValid(c),
    fake: (c, rng) => {
      const letters = /^[A-Z]{2}/i.test(c) ? draw(rng, 2, AZ) : draw(rng, 1, AZ);
      return repair(letters + draw(rng, 6) + "0", [{ i: letters.length + 6, cs: D + "A" }], hkHkidValid);
    },
  },
  {
    id: "jp_mynumber",
    cat: "national_id",
    is: (c) => /^\d{12}$/.test(c) && jpMyNumberValid(c),
    fake: (c, rng) => repairLast(draw(rng, 11) + "0", jpMyNumberValid),
  },
  {
    id: "il_id",
    cat: "national_id",
    is: (c) => /^\d{9}$/.test(c) && ilIdValid(c),
    fake: (c, rng) => repairLast(draw(rng, 8) + "0", ilIdValid),
  },
  {
    id: "nz_ird",
    cat: "national_id",
    is: (c) => /^\d{8,9}$/.test(c) && nzIrdValid(c),
    // Stay inside the ISSUED range (10-150 million) the validator enforces.
    fake: (c, rng) => {
      const head = c.length === 8 ? String(1 + rng(9)) : "1" + String(rng(5));
      return repairLast(head + draw(rng, c.length - head.length - 1) + "0", nzIrdValid);
    },
  },
  {
    id: "au_tfn",
    cat: "national_id",
    is: (c) => /^\d{8,9}$/.test(c) && auTfnValid(c),
    fake: (c, rng) => repairLast(draw(rng, c.length - 1) + "0", auTfnValid),
  },
  {
    id: "au_abn",
    cat: "company_id",
    is: (c) => /^\d{11}$/.test(c) && auAbnValid(c),
    fake: (c, rng) => repair(draw(rng, 9) + "00", last2(c), auAbnValid),
  },
  {
    id: "au_acn",
    cat: "company_id",
    is: (c) => /^\d{9}$/.test(c) && auAcnValid(c),
    fake: (c, rng) => repairLast(draw(rng, 8) + "0", auAcnValid),
  },
  {
    id: "au_medicare",
    cat: "national_id",
    is: (c) => /^[2-6]\d{9,10}$/.test(c) && auMedicareValid(c),
    // Keep the trailing issue digit(s); the check sits at position 8.
    fake: (c, rng) =>
      repair(String(2 + rng(5)) + draw(rng, 7) + "0" + c.slice(9), [{ i: 8, cs: D }], auMedicareValid),
  },
  {
    id: "th_tnin",
    cat: "national_id",
    // The first two digits carry the person-type/region classes the rule
    // requires — kept so the fake still matches the detection shape.
    is: (c) => /^[1-9]\d{12}$/.test(c) && thTninValid(c),
    fake: (c, rng) => repairLast(c.slice(0, 2) + draw(rng, 10) + "0", thTninValid),
  },
  // ── Device / vehicle / entity ─────────────────────────────────────────────
  {
    id: "iccid",
    cat: "national_id",
    // The 89 telecom MII is a spec constant; the Luhn check digit is recomputed.
    is: (c) => /^89\d{17,18}$/.test(c) && iccidValid(c),
    fake: (c, rng) => {
      const body = "89" + draw(rng, c.length - 3);
      return body + luhnCheckDigit(body);
    },
  },
  {
    id: "imei",
    cat: "national_id",
    is: (c) => /^\d{15}$/.test(c) && imeiValid(c),
    fake: (c, rng) => {
      const body = draw(rng, 14);
      return body + luhnCheckDigit(body);
    },
  },
  {
    id: "vin",
    cat: "national_id",
    is: (c) => vinValid(c),
    fake: (c, rng) => {
      const CS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"; // ISO 3779: no I/O/Q
      return repair(draw(rng, 17, CS), [{ i: 8, cs: D + "X" }], vinValid);
    },
  },
  {
    id: "lei",
    cat: "company_id",
    // The 4-char LOU prefix names the ISSUING authority, not the entity — kept.
    is: (c) => /^[A-Z0-9]{18}\d{2}$/i.test(c) && leiValid(c),
    fake: (c, rng) => {
      const body = c.slice(0, 4).toUpperCase() + draw(rng, 14, AZ + D);
      return body + p2(98 - mod97(body + "00"));
    },
  },
];
