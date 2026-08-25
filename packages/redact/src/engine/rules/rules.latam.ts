import type { RedactionRule } from "../../types";
import { gate, re } from "./rules.international.util";
import { arCuitValid, brCpfValid, brCnpjValid, clRutValid } from "../validators/validators.world";

// Latin-American identity / tax schemes — all checksum-validated (strong double
// mod-11 family), all → "national_id". The FORMATTED national writings (dots,
// dashes, slashes) are distinctive and fire bare with their checksum; the glued
// digit runs are banal and stay context-gated on the scheme's own acronym.
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

export const LATAM_RULES: RedactionRule[] = [
  // Brazil — CPF ("111.444.777-35"): dotted-dashed form bare; glued 11 digits gated.
  nid(re(String.raw`\b\d{3}\.\d{3}\.\d{3}-\d{2}\b`), brCpfValid),
  nid(gate("cpf", String.raw`\d{11}\b`), brCpfValid),
  // Brazil — CNPJ ("11.222.333/0001-81"): formatted bare; glued 14 digits gated.
  cid(re(String.raw`\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b`), brCnpjValid),
  cid(gate("cnpj", String.raw`\d{14}\b`), brCnpjValid),
  // Chile — RUT/RUN ("12.345.678-5", DV may be K): dotted form bare; the undotted
  // `12345678-5` reads like a ref number → gated on rut/run.
  nid(re(String.raw`\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b`), clRutValid),
  nid(gate("rut|run", String.raw`\d{7,8}-?[\dkK]\b`), clRutValid),
  // Argentina — CUIT/CUIL ("20-12345678-6"): the issued prefixes + dashes are
  // distinctive → bare with checksum; glued 11 digits gated.
  nid(re(String.raw`\b(?:2[03457]|3[034])-\d{8}-\d\b`), arCuitValid),
  nid(gate("cuit|cuil", String.raw`\d{11}\b`), arCuitValid),
];
