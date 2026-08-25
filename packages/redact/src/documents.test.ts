import { describe, it, expect, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { extractText, redactDocument } from "./documents/documents";
import { unredact } from "./index";

/* The ported document-redaction pipeline: a real file on disk → extracted text
   → redaction. One case per extracted format (csv / xlsx / docx / pdf), proving
   extractText pulls the PII-bearing text and that redactDocument scrubs it while
   keeping it restorable. Fixtures live next to this test in ./__fixtures__. */

const fx = (name: string) =>
  fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));

/* ⏱ These cases load a REAL document library (pdf.js, xlsx, mammoth) and parse a real
   fixture — the work itself is well under a second, but each test FILE pays the library
   import in its own worker, so the 5s default is a MODULE-LOAD budget, not an assertion
   budget. On a runner busy with other files it can exceed 5s and fail with no bug behind
   it. 20s is insurance, not tolerance for slowness: a genuine hang still fails, just
   later. Give a new file in this family the same budget — it pays the same import. */
vi.setConfig({ testTimeout: 20_000 });

const EMAIL = "amelie.brivet@example.com";

describe("extractText", () => {
  it("CSV → text with kind 'csv'", async () => {
    const f = await extractText(fx("sample.csv"));
    expect(f.error).toBeUndefined();
    expect(f.kind).toBe("csv");
    expect(f.text).toContain(EMAIL);
  });

  it("XLSX → sheet flattened to CSV text", async () => {
    const f = await extractText(fx("sample.xlsx"));
    expect(f.error).toBeUndefined();
    expect(f.kind).toBe("xlsx");
    expect(f.text).toContain(EMAIL);
    expect(f.text).toContain("priya.naik@globex.co.uk");
  });

  it("DOCX → paragraph text via mammoth", async () => {
    const f = await extractText(fx("sample.docx"));
    expect(f.error).toBeUndefined();
    expect(f.kind).toBe("docx");
    expect(f.text).toContain(EMAIL);
  });

  it("PDF → text layer via pdf.js", async () => {
    const f = await extractText(fx("sample.pdf"));
    expect(f.error).toBeUndefined();
    expect(f.kind).toBe("pdf");
    expect(f.text).toContain(EMAIL);
  });

  it("unsupported type → error, no throw", async () => {
    const f = await extractText(fx("missing.heic"));
    // Either an unsupported-type error or a read error — never a throw.
    expect(f.error).toBeTruthy();
    expect(f.text).toBe("");
  });
});

describe("redactDocument", () => {
  it("scrubs an extracted file and stays reversible", async () => {
    const { text, wire, vault, matches } = await redactDocument(fx("sample.csv"));
    // The original PII is in the extracted text…
    expect(text).toContain(EMAIL);
    // …but never in the wire copy handed to a model…
    expect(wire).not.toContain(EMAIL);
    expect(matches.length).toBeGreaterThan(0);
    // …and the vault restores it (e.g. a document the model echoes back).
    expect(unredact(wire, vault)).toBe(text);
  });
});
