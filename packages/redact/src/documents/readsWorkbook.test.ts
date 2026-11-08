import { describe, expect, it } from "vitest";
import { readsWorkbook } from "./formats";

/**
 * The extraction worker answers `recycle` when SheetJS read the file, and the app retires that
 * worker: a crafted workbook's writes into the shared prototypes never meet the next document.
 * The predicate must name every file the extraction routes to SheetJS — and no other.
 */
describe("readsWorkbook", () => {
  it("names the spreadsheet formats SheetJS reads, by extension, any case, any path", () => {
    for (const n of ["a.xlsx", "B.XLSM", "c.xls", "d.ods", "/tmp/x/y.xlsx", "C:\\Users\\a\\b.xlsx"]) {
      expect(readsWorkbook(n), n).toBe(true);
    }
  });

  it("falls back on the MIME type when the name has no extension, as the extraction does", () => {
    expect(readsWorkbook("upload", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(readsWorkbook("upload", "application/pdf")).toBe(false);
  });

  it("leaves out what another reader handles (CSV has its own), and the name wins over the MIME type", () => {
    for (const n of ["a.csv", "a.tsv", "a.pdf", "a.docx", "a.txt", ".xlsx"]) expect(readsWorkbook(n), n).toBe(false);
    expect(readsWorkbook("a.pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false);
  });
});
