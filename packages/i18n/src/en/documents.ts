/**
 * The EN « documents » slice.
 */
import type { Messages } from "../messages";

export const documents = {
  refused: {
    fileTooLarge: (mb) => `File too large (${mb} MB max). Save it as several smaller files, then attach them one at a time.`,
    pdfTooManyPages: (pages, max) =>
      `PDF too long (${pages} pages, ${max} max). Save it as several smaller PDFs, then attach them one at a time.`,
    tooLongToMask: (pages) =>
      `Too long to mask in full (≈ ${pages} pages). Save it as several smaller files, then attach them one at a time.`,
    executable: "File type not allowed: the file contains executable code.",
    typeMismatch: "File refused: its content does not match its extension.",
    imageTooLarge: (width, height) => `Image refused: dimensions too large (${width}×${height}).`,
    imageUnreadable: "Image refused: its dimensions can't be read.",
    zipEntries: (entries) => `Compressed file refused: it contains too many entries (${entries}).`,
    zipTooLarge: "Compressed file refused: it would be too large once uncompressed.",
    zipRatio: "File refused: its compression ratio is abnormal.",
  },
  ocr: {
    failed:
      "The text couldn't be read. Try again. If it's a scan or a photo, try a sharper copy. If it keeps happening, report it from “Your feedback”.",
    engineMissing: "The text recognition engine is unavailable. Reinstall the app.",
    engineIncompatible: "The text recognition engine is incompatible. Reinstall the app.",
    pdfRendererMissing: "The PDF rendering engine is unavailable on this computer. Reinstall the app.",
    pdfRendererIncompatible: "The PDF rendering engine is incompatible with this computer. Reinstall the app.",
  },
  scanPdf: (cause) => `This PDF is a scanned image: its text has to be recognized before sending. ${cause}`,
  pdfPagesUnread: (pages, cause) =>
    pages === 1
      ? `This PDF isn't attached: its image page couldn't be read. ${cause}`
      : `This PDF isn't attached: its ${pages} image pages couldn't be read. ${cause}`,
  imageOcrFailed: "The image text could not be read. Text recognition failed. The technical cause is in the debug log.",
  readerUnavailable: "The document reader could not start: the file is not read. Restart the app; if this goes on, reinstall it.",
  readerOverMemory: "This file needs more memory than the document reader may use: it is not read. Try a lighter file, or split it.",
  readerOverDisk: "Reading this file needs more disk space than the document reader may use: it is not read. Try a lighter file, or split it.",
  unsupportedType: (ext) => (ext ? `Unsupported file type: ${ext}` : "Unsupported file type (no extension)."),
  markers: {
    pageTooLarge: (page) => `[… page ${page} not read: image too large]`,
  },
} satisfies Messages["documents"];
