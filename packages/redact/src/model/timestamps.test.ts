import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import type { Vault } from "../types";

// Regression: `pseudonymize` (the fake engine used for chat + MCP tool-result
// redaction) used to gather regex-rule matches WITHOUT running each rule's
// checksum `validate`, so a bare 10-digit Unix timestamp — a Stripe `created`
// field — got faked (the over-broad NHS rule's optional separators matched any 10
// digits). The model then reasoned on the fake number → nonsense far-future dates,
// and it's IRREVERSIBLE (the model derives a date, not the verbatim token). Bare
// timestamps must pass through untouched.
describe("pseudonymize honours checksum gates (no timestamp/id over-redaction)", () => {
  it("leaves bare 10-digit Unix timestamps in a JSON tool result in clear", async () => {
    const json =
      '{"id":"pi_x","amount":2900,"created":2520525167,"customer":"cus_y","updated":8187896118}';
    const vault: Vault = {};
    const { text, matches } = await pseudonymize(json, { vault, numbers: false });
    for (const ts of ["2520525167", "8187896118"]) expect(text).toContain(ts);
    expect(matches.some((m) => m.value === "2520525167" || m.value === "8187896118")).toBe(false);
  });

  it("still fakes a real NHS number (spaced form, checksum-valid)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Patient NHS 401-023-2137.", { vault, numbers: false });
    expect(text).not.toContain("401-023-2137");
  });

  it("leaves 13-digit epoch-ms file revisions in clear (Luhn/TNIN collisions — journal 01/08)", async () => {
    // Les mtimes epoch-ms d'un `get_file_info` : ~1/10 passent Luhn (→ « card »), ~1/11 le
    // mod-11 du TNIN thaï (→ « national_id ») — le redaction était SPORADIQUE et la
    // révision corrompue pour le modèle. Les sept valeurs du journal, checksum-heureuses
    // ou non, doivent toutes passer en clair.
    const revisions = [
      "1767643960092", "1743153847365", "1767643942767", // passaient un checksum
      "1785234402000", "1767768773419", "1755166878716", "1785235021722",
    ];
    for (const rev of revisions) {
      const vault: Vault = {};
      const { matches } = await pseudonymize(`révision: ${rev}:75851`, { vault, numbers: false });
      expect(matches.filter((m) => m.value === rev)).toEqual([]);
    }
  });

  it("a SEPARATED card number is untouched by the epoch guard (contiguous-only)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("CB 4716 6337 1042 9833", { vault, numbers: false });
    expect(text).not.toContain("4716 6337 1042 9833"); // Luhn-valid 16-digit, still redacted
  });
});
