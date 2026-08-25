import { describe, expect, it } from "vitest";
import { parseCsvText, isTotalRow } from "./csvParse";

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
});
