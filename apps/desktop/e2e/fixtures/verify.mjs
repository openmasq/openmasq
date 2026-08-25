// Sanity-check the PII fixtures: extract text the SAME way the desktop app does
// (`@openmasq/redact/documents` `extractBytes` — pdf.js for PDF, sheetjs for XLSX,
// mammoth for DOCX, utf8 for the rest), then run the redaction engine and report how
// many sensitive spans each file yields.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";
import { extractBytes } from "@openmasq/redact/documents";
import { redact } from "@openmasq/redact";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "pii");
// Images need OCR (tesseract) — skip them in this text-only sanity check.
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"]);

async function extract(path) {
  if (IMAGE.has(extname(path).toLowerCase())) return null;
  const bytes = new Uint8Array(await readFile(path));
  const { text } = await extractBytes(bytes, path);
  return (text ?? "").trim();
}

for (const name of (await readdir(dir)).sort()) {
  const text = await extract(resolve(dir, name));
  if (text == null) {
    console.log(`${name.padEnd(26)}  (binary — not text-extracted by the app)`);
    continue;
  }
  const { matches } = redact(text);
  const kinds = [...new Set(matches.map((m) => m.type))].join(",");
  console.log(`${name.padEnd(26)}  ${String(text.length).padStart(6)} chars  ${String(matches.length).padStart(3)} redactions  [${kinds}]`);
}
