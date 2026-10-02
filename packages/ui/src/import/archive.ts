/**
 * Read the user-picked export file into the JSON payload the parsers consume.
 * Accepts the raw `conversations.json` OR the whole export zip (both providers ship
 * one) — inside a zip we locate `conversations.json` wherever it sits. Everything
 * runs LOCALLY in the renderer (File API bytes in, object out); nothing is uploaded.
 * `fflate` is lazy-imported so the zip inflater stays out of the main bundle (same
 * pattern as the DOCX exporter).
 */

import type { Messages } from "@openmasq/i18n";

const ZIP_MAGIC = [0x50, 0x4b]; // "PK"

/** Throws user-facing messages in the UI language (`t`): the import modal shows them verbatim. */
export async function readExportFile(bytes: Uint8Array, t: Messages): Promise<unknown> {
  const isZip = bytes.length > 2 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1];
  const text = isZip ? await conversationsJsonFromZip(bytes, t) : new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(t.runtime.files.importNotJson);
  }
}

async function conversationsJsonFromZip(bytes: Uint8Array, t: Messages): Promise<string> {
  const { unzipSync } = await import("fflate");
  let entries: Record<string, Uint8Array>;
  try {
    // Only inflate the file we need — a full export zip can hold years of images.
    entries = unzipSync(bytes, { filter: (f) => /(^|\/)conversations\.json$/.test(f.name) });
  } catch {
    throw new Error(t.runtime.files.importZipUnreadable);
  }
  const name = Object.keys(entries)[0];
  if (!name) throw new Error(t.runtime.files.importNoJsonInZip);
  return new TextDecoder().decode(entries[name]);
}
