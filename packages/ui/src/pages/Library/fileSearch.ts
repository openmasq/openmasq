import type { LibFile } from "./libFile";

/** Fold: lowercase + strip diacritics, so "resume" matches "résumé". */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Stored files matching a ⌘K query — accent-insensitive substring over the file
 * NAME and its owning conversation's title (the same two fields the Bibliothèque
 * search box matches). Empty query ⇒ none, so the palette stays conversation-first
 * until you type. Capped (`limit`) so a broad term can't flood the palette with
 * hundreds of rows — the user narrows, or opens the Bibliothèque for the full grid.
 * Pure + unit-tested.
 */
export function searchFiles(files: LibFile[], query: string, limit = 8): LibFile[] {
  const q = fold(query.trim());
  if (!q) return [];
  const out: LibFile[] = [];
  for (const f of files) {
    if (fold(`${f.name} ${f.conversationTitle}`).includes(q)) out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}
