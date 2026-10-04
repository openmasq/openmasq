/**
 * The EN « documents » slice.
 */
import type { Messages } from "../messages";

export const documents = {
  refused: {
    fileTooLarge: (mb) => `File too large (${mb} MB max). Split it into smaller parts.`,
    pdfTooManyPages: (pages, max) => `PDF too long (${pages} pages, ${max} max). Split it into smaller parts.`,
    tooLongToMask: (pages) => `Too long to mask in full (≈ ${pages} pages). Split it into smaller parts.`,
    executable: "File type not allowed: the file contains executable code.",
    typeMismatch: "File refused: its content does not match its extension.",
    imageTooLarge: (width, height) => `Image refused: dimensions too large (${width}×${height}).`,
    imageUnreadable: "Image refused: its dimensions can't be read.",
    zipEntries: (entries) => `Compressed file refused: it contains too many entries (${entries}).`,
    zipTooLarge: "Compressed file refused: it would be too large once uncompressed.",
    zipRatio: "File refused: its compression ratio is abnormal.",
  },
  ocr: {
    failed: "Text recognition failed. The technical cause is in the debug log.",
    engineMissing: "The text recognition engine is unavailable. Reinstall the app.",
    engineIncompatible: "The text recognition engine is incompatible. Reinstall the app.",
    pdfRendererMissing: "The PDF rendering engine is unavailable on this computer. Reinstall the app.",
    pdfRendererIncompatible: "The PDF rendering engine is incompatible with this computer. Reinstall the app.",
  },
  scanPdf: (cause) => `This PDF has no text layer. ${cause}`,
  pdfPagesUnread: (pages, cause) =>
    pages === 1
      ? `This PDF isn't attached: its image page couldn't be read. ${cause}`
      : `This PDF isn't attached: its ${pages} image pages couldn't be read. ${cause}`,
  imageOcrFailed: "The image text could not be read. Text recognition failed. The technical cause is in the debug log.",
  unsupportedType: (ext) => (ext ? `Unsupported file type: ${ext}` : "Unsupported file type (no extension)."),
  markers: {
    pageTooLarge: (page) => `[… page ${page} not OCR'd: dimensions too large]`,
  },
} satisfies Messages["documents"];
