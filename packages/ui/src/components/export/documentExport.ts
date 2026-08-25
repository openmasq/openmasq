/**
 * Pure helpers + a client-side download for a model-generated "document" artifact
 * (a ```document fence, rendered as the bordered DocumentCard). Downloading is a
 * plain Blob — no backend — mirroring the audit-log CSV export. The exported text
 * is the reply's UN-REDACTED content (the user's real values, restored) — it never
 * goes back to the model, so the file carries real data as promised.
 */

/** The document's display title: its first Markdown H1 (`# …`), else the first
 *  non-empty line (stripped of leading markdown marks), capped at 80 chars; else
 *  "Document". Pure — unit-tested. */
export function documentTitle(text: string): string {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h1 = /^#{1,6}\s+(.+)$/.exec(line);
    const t = (h1 ? h1[1] : line).replace(/[#*_`>~]/g, "").trim();
    // Skip an all-punctuation line (e.g. a `---` rule) — needs a letter or digit.
    if (t && /[\p{L}\p{N}]/u.test(t)) return t.length > 80 ? t.slice(0, 79).trimEnd() + "…" : t;
  }
  return "Document";
}

/** A filesystem-safe filename `slug.ext` from the title (kebab, accent-stripped). */
export function documentFilename(title: string, ext: string): string {
  const slug =
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document";
  return `${slug}.${ext}`;
}

/** Trigger a client-side download of a Blob part (text or bytes) as a file. No
 *  backend, no network. Accepts a `Uint8Array` (from the PDF/DOCX generators) too. */
export function downloadBlob(filename: string, mime: string, part: BlobPart | Uint8Array): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([part as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download `text` as a text file (`.md`/`.txt`). */
export function downloadTextFile(filename: string, mime: string, text: string): void {
  downloadBlob(filename, mime, text);
}
