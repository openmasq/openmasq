import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { redact, unredact, type Vault } from "../index";

/* Attachments (CSV, TSV, XLSX, JSON, Markdown, PDF, .env…) are all reduced to
   plain TEXT before they're redacted — the desktop main process extracts the
   text (apps/desktop/src/main/files.ts) and the SAME redaction path runs on it.
   So "a test per file type" means: take text shaped the way each format is
   extracted, and prove the sensitive values buried in that structure are
   (1) detected, (2) never leaked into the wire text, and (3) perfectly
   restored. The redaction engine is format-agnostic; these guard the claim. */

const EMAIL = "marcus@acme.com";
const EMAIL2 = "ops@infra.net";
const PHONE = "+33 6 12 34 56 78";
const IP = "10.0.0.42";
const APIKEY = "sk-live-DEADBEEF1234567890ABCD";

/**
 * Run the redact → unredact round-trip over already-extracted file text and
 * assert the reversible-redaction guarantee plus that every expected value was
 * actually caught through the format's structure (commas, quotes, pipes…).
 */
function expectRoundTrip(extracted: string, mustDetect: string[]): Vault {
  const vault: Vault = {};
  const { text } = redact(extracted, { vault });

  // (1) Nothing we redacted may still appear verbatim in the wire text.
  for (const original of Object.values(vault)) {
    expect(text).not.toContain(original);
  }
  // (2) Each sensitive value was detected despite the surrounding format.
  for (const value of mustDetect) {
    expect(Object.values(vault)).toContain(value);
  }
  // (3) The extracted text is restored byte-for-byte from the vault.
  expect(unredact(text, vault)).toBe(extracted);
  return vault;
}

describe("redaction across file types (extracted text)", () => {
  it("plain text (.txt): PII in prose", () => {
    const txt = `Hi team,\nplease email ${EMAIL} or call ${PHONE}.\nThe staging box lives at ${IP}.`;
    expectRoundTrip(txt, [EMAIL, PHONE, IP]);
  });

  it("CSV (.csv): values in comma-separated cells", () => {
    const csv = [
      "name,email,phone,host",
      `Marcus,${EMAIL},${PHONE},${IP}`,
      `Ops,${EMAIL2},,`,
    ].join("\n");
    expectRoundTrip(csv, [EMAIL, EMAIL2, PHONE, IP]);
  });

  it("TSV (.tsv): values in tab-separated cells", () => {
    const tsv = [
      "name\temail\tphone",
      `Marcus\t${EMAIL}\t${PHONE}`,
    ].join("\n");
    expectRoundTrip(tsv, [EMAIL, PHONE]);
  });

  it("JSON (.json): values inside quoted fields", () => {
    const json = JSON.stringify({
      contact: { email: EMAIL, phone: PHONE },
      server: IP,
    });
    expectRoundTrip(json, [EMAIL, PHONE, IP]);
  });

  it("Markdown (.md): values inside a pipe table", () => {
    const md = [
      "| Name | Email | Phone |",
      "|------|-------|-------|",
      `| Marcus | ${EMAIL} | ${PHONE} |`,
    ].join("\n");
    expectRoundTrip(md, [EMAIL, PHONE]);
  });

  it("PDF (.pdf): multiline text as the flat fallback emits it", () => {
    // The flat first-party fallback strips layout to bare lines — no delimiters at all.
    const pdf = ["Invoice contact", "Marcus Foy", EMAIL, PHONE, `Host ${IP}`].join(
      "\n",
    );
    expectRoundTrip(pdf, [EMAIL, PHONE, IP]);
  });

  it("config (.env): a real secret key plus host/email", () => {
    const env = [
      `DATABASE_HOST=${IP}`,
      `ADMIN_EMAIL=${EMAIL}`,
      `STRIPE_SECRET=${APIKEY}`,
    ].join("\n");
    expectRoundTrip(env, [IP, EMAIL, APIKEY]);
  });

  it("XLSX (.xlsx): cells flattened to CSV by sheetjs, then redacted", () => {
    // Mirror apps/desktop/src/main/files.ts: each sheet → sheet_to_csv. We build
    // a real workbook here so the test exercises the actual extraction shape.
    const ws = XLSX.utils.aoa_to_sheet([
      ["name", "email", "phone"],
      ["Marcus", EMAIL, PHONE],
      ["Ops", EMAIL2, ""],
    ]);
    const extracted = XLSX.utils.sheet_to_csv(ws).trim();
    expect(extracted).toContain(EMAIL); // sanity: sheetjs kept the cell as text
    expectRoundTrip(extracted, [EMAIL, EMAIL2, PHONE]);
  });

  it("DOCX (.docx): paragraphs extracted by mammoth, then redacted", async () => {
    // Mirror apps/desktop/src/main/files.ts: a real .docx → mammoth raw text →
    // redaction. The fixture is a Word file holding fake PII across paragraphs.
    const fixture = fileURLToPath(
      new URL("../__fixtures__/sample.docx", import.meta.url),
    );
    const { value } = await mammoth.extractRawText({ buffer: readFileSync(fixture) });
    const extracted = value.trim();
    const docxEmail = "amelie.brivet@example.com"; // address present in the fixture
    expect(extracted).toContain(docxEmail); // sanity: mammoth pulled the paragraph text
    expectRoundTrip(extracted, [docxEmail, PHONE, IP, APIKEY]);
  });
});
