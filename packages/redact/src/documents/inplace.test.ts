import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { strToU8, strFromU8, zipSync, unzipSync } from "fflate";
import { redact, type Vault } from "../index";
import { redactFileInPlace, BlockedUploadError, type Scrub } from "./inplace";

/* In-place document redaction: the file keeps its FORMAT, the sensitive text
   inside is scrubbed (so the model still gets a real .csv/.xlsx/.docx). Verifies
   each supported format round-trips through its real parser with the PII gone but
   the structure intact, and that blocked formats refuse. */

const EMAIL = "marcus@acme.com";

// A scrub bound to a shared vault (mirrors how the injector wires it).
const makeScrub = (vault: Vault): Scrub => (text) => {
  const { text: out, matches } = redact(text, { vault });
  return { text: out, pairs: matches.map((m) => ({ from: m.value, to: m.placeholder })) };
};

const fx = (name: string) => readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)));

describe("redactFileInPlace", () => {
  it("CSV: scrubs the text, keeps it a CSV", () => {
    const csv = `name,email\nAmelie,${EMAIL}\n`;
    const out = redactFileInPlace("data.csv", strToU8(csv), "text/csv", makeScrub({}));
    const text = strFromU8(out.bytes);
    expect(text).not.toContain(EMAIL);
    expect(text).toContain("[REDACTED_EMAIL_1]");
    expect(text.startsWith("name,email")).toBe(true); // structure preserved
  });

  it("XLSX: scrubs cell values, file still opens as a workbook", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["name", "email"],
      ["Amelie", EMAIL],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "People");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));

    const out = redactFileInPlace("data.xlsx", bytes, "", makeScrub({}));
    // re-open the redacted workbook and read it back
    const back = XLSX.read(out.bytes, { type: "array" });
    const csv = XLSX.utils.sheet_to_csv(back.Sheets[back.SheetNames[0]]);
    expect(csv).not.toContain(EMAIL);
    expect(csv).toContain("[REDACTED_EMAIL_1]");
    expect(csv).toContain("name,email"); // header preserved
  });

  it("DOCX: scrubs the document text, file still opens via mammoth", async () => {
    const out = redactFileInPlace("sample.docx", fx("sample.docx"), "", makeScrub({}));
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(out.bytes) });
    expect(value).not.toContain("amelie.brivet@example.com");
    expect(value).toContain("[REDACTED_EMAIL_");
  });

  it("XLSX: scrubs a NUMERIC cell's formatted value, not only strings (audit — model reads cell.w)", () => {
    const ws = XLSX.utils.aoa_to_sheet([["contact"], ["x"]]);
    // A sensitive identifier (account/phone) stored as a NUMBER — the old string-only
    // branch left it REAL in the saved bytes while the model saw it redacted.
    ws["A2"] = { t: "n", v: 612345678 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const scrub: Scrub = (t) =>
      t.includes("612345678")
        ? { text: t.split("612345678").join("[NUM]"), pairs: [{ from: "612345678", to: "[NUM]" }] }
        : { text: t, pairs: [] };
    const back = XLSX.read(redactFileInPlace("c.xlsx", bytes, "", scrub).bytes, { type: "array" });
    const cell = back.Sheets["S"]["A2"];
    expect(cell.t).toBe("s"); // downgraded from numeric to a text placeholder
    expect(String(cell.v)).toBe("[NUM]");
    expect(String(cell.v)).not.toContain("612345678");
  });

  it("XLSX: scrubs document Props (author/company) + cell COMMENTS, not only cells (audit)", () => {
    const ws = XLSX.utils.aoa_to_sheet([["ok"]]);
    // A comment (with its author) on a cell the value loop never rewrites.
    ws["A1"].c = [{ a: "Jean Rebour", t: "voir avec Jean Rebour avant envoi" }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    wb.Props = { Author: "Jean Rebour", Company: "Jean Rebour SARL" };
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", Props: wb.Props }));
    const scrub: Scrub = (t) =>
      t.includes("Jean Rebour")
        ? { text: t.split("Jean Rebour").join("[NAME]"), pairs: [{ from: "Jean Rebour", to: "[NAME]" }] }
        : { text: t, pairs: [] };
    const out = redactFileInPlace("c.xlsx", bytes, "", scrub);
    // The author's real name survives NOWHERE in the redacted bytes (metadata included).
    expect(strFromU8(out.bytes)).not.toContain("Jean Rebour");
    const back = XLSX.read(out.bytes, { type: "array" });
    expect(String(back.Props?.Author ?? "")).not.toContain("Jean Rebour");
  });

  it("DOCX: scrubs PII in docProps metadata (author) + a header, not only the body (audit)", () => {
    const zip: Record<string, Uint8Array> = {
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8(
        "<w:document><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>",
      ),
      "docProps/core.xml": strToU8(
        "<cp:coreProperties><dc:creator>Jean Rebour</dc:creator></cp:coreProperties>",
      ),
      "word/header1.xml": strToU8("<w:hdr><w:p><w:r><w:t>Jean Rebour</w:t></w:r></w:p></w:hdr>"),
    };
    const scrub: Scrub = (t) =>
      t.includes("Jean Rebour")
        ? { text: t.split("Jean Rebour").join("[NAME]"), pairs: [{ from: "Jean Rebour", to: "[NAME]" }] }
        : { text: t, pairs: [] };
    const rezip = unzipSync(redactFileInPlace("c.docx", zipSync(zip), "", scrub).bytes);
    expect(strFromU8(rezip["docProps/core.xml"])).not.toContain("Jean Rebour");
    expect(strFromU8(rezip["word/header1.xml"])).not.toContain("Jean Rebour");
  });

  it("PDF / images / unknown → blocked", () => {
    expect(() => redactFileInPlace("scan.pdf", new Uint8Array(), "", makeScrub({}))).toThrow(
      BlockedUploadError,
    );
    expect(() => redactFileInPlace("photo.png", new Uint8Array(), "", makeScrub({}))).toThrow(
      BlockedUploadError,
    );
    expect(() => redactFileInPlace("a.bin", new Uint8Array(), "", makeScrub({}))).toThrow(
      BlockedUploadError,
    );
  });
});
