import { describe, expect, it } from "vitest";
import { MAX_CSV_ROWS, parseCsvText, isTotalRow } from "./csvParse";

describe("parseCsvText", () => {
  it("parses a semicolon-delimited table with total rows", () => {
    const csv = [
      "Lot;Type;Montant à répartir (€);Votre quote-part (€)",
      "Appartement (Lot 15);Charges générales;9088,45;72,52",
      "Cave (Lot 27);Charges générales;9088,45;1,81",
      "", // blank separator line — dropped
      ";;TOTAL GÉNÉRAL;196,68",
    ].join("\n");
    const t = parseCsvText(csv);
    expect(t).not.toBeNull();
    expect(t!.headers).toEqual(["Lot", "Type", "Montant à répartir (€)", "Votre quote-part (€)"]);
    expect(t!.rows).toHaveLength(3); // 2 data + 1 total (blank line dropped)
    expect(t!.rows[0][0]).toBe("Appartement (Lot 15)");
    expect(t!.rows[2]).toEqual(["", "", "TOTAL GÉNÉRAL", "196,68"]);
    expect(isTotalRow(t!.rows[2])).toBe(true);
    expect(isTotalRow(t!.rows[0])).toBe(false);
  });

  it("auto-detects a comma delimiter + respects quoted fields", () => {
    const t = parseCsvText('a,b,c\n"x, y",2,3\n4,5,6');
    expect(t!.headers).toEqual(["a", "b", "c"]);
    expect(t!.rows[0]).toEqual(["x, y", "2", "3"]);
  });

  it("returns null for non-tabular text (single column / one line)", () => {
    expect(parseCsvText("just one line")).toBeNull();
    expect(parseCsvText("a\nb\nc")).toBeNull(); // single column
  });

  // A ```csv fence a model can be talked into emitting used to CRASH the whole app:
  // parsing runs during render under the root ErrorBoundary only, so the error card
  // replaced the entire UI and re-threw on reopening the conversation.
  it("refuse une table démesurée au lieu de la rendre (plafond de lignes)", () => {
    const csv = ["a;b", ...Array.from({ length: MAX_CSV_ROWS }, () => "1;2")].join("\n");
    expect(csv.split("\n").length).toBeGreaterThan(MAX_CSV_ROWS);
    expect(parseCsvText(csv)).toBeNull(); // → the caller falls back to a code block
  });

  it("compte les colonnes SANS spread — une grande table juste sous le plafond rend", () => {
    // The column count is folded (`reduce`), not spread into `Math.max(...)`, which throws
    // « too many arguments » past ~125 000 rows. The cap above now keeps us far from that
    // limit, so this asserts the OTHER half: a table just under it still renders whole.
    const csv = ["a;b", ...Array.from({ length: MAX_CSV_ROWS - 1 }, () => "1;2")].join("\n");
    const t = parseCsvText(csv);
    expect(t).not.toBeNull();
    expect(t!.rows).toHaveLength(MAX_CSV_ROWS - 1);
    expect(t!.headers).toEqual(["a", "b"]);
  });
});
