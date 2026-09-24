import type { RedactionRule } from "../../types";
import { re } from "./rules.international.util";

// PROCEDURE identifiers of the international courts — the sibling of the RG / Portalis /
// toque block in `rules.france.ts`, for the same reason: a docket number carries no
// personal data by itself and RE-IDENTIFIES the parties whose names were just redacted.
//
// The ECHR application number is « 36110/97 » — sequence / two-digit year — and TAB (127
// Strasbourg rulings) writes it in LISTS: « nos. 65731/01 and 65900/01 », « 62776/00,
// 63388/00, 63464/00 ». Measured before this rule: 102 of the 151 numbers the engine
// missed sat in such a list, where an anchor on « no. » only reaches the first.
//
// So the anchor is EITHER the scheme word OR the previous number and its separator, and
// the chain walks the whole enumeration one number at a time, each its own span. A bare
// « 13/40 » (a sheet/plan reference, a fraction, a score) never fires: the shape is banal
// and the anchor IS the precision, the discipline every gated scheme here follows.
const NO = String.raw`(?:app(?:lication)?s?\.?[ ]*nos?\.?|nos?\.|n[°o]s?\.?|requ[eê]tes?[ ]*n[°o]s?\.?)`;
const NUM = String.raw`\d{3,6}/\d{2}`;
const SEP = String.raw`(?:,[ ]*|[ ]+(?:and|et|&)[ ]+)`;
export const COURT_RULES: RedactionRule[] = [
  {
    type: "national_id",
    pattern: re(String.raw`(?<=(?:${NO}[ ]*|${NUM}${SEP}))${NUM}\b`, "gi"),
  },
];
