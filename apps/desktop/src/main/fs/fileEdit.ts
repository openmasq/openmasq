// The PURE half of the model-facing file ops: everything `toolOps.ts` decides that is a
// function of its arguments alone. No `fs`, no grant, no process — so each rule below is
// checkable in `fileEdit.test.ts` rather than only through a live worker.

/**
 * A file's version stamp, as the model sees it.
 *
 * `mtimeMs:size` is deliberately CHEAP: it comes from the `stat` every op already does,
 * so exposing it costs nothing. It is a CONCURRENCY check, not an integrity one — it
 * detects "someone else wrote this file since you read it", which is the failure that
 * actually bites (the user edits in their editor while the model is thinking). It does
 * NOT detect a change that preserves both mtime and size; nothing that cheap could.
 */
export function revisionOf(info: { mtimeMs: number; size: number }): string {
  return `${Math.floor(info.mtimeMs)}:${info.size}`;
}

export interface EditResult {
  content: string;
  occurrences: number;
}

/**
 * Replace `oldText` with `newText` inside `content`.
 *
 * **Fail closed, never a guessy partial write** — the same contract as
 * `state/documentEdit.ts` `replaceDocumentInContent`, which is the renderer's half of
 * this idea (editing a ```document fence). Every ambiguity throws with a message the
 * model can act on, because the alternative is silently editing the WRONG occurrence of
 * a string in the user's file and reporting success:
 *
 * - empty `oldText` — matches at every position; there is no "insert here" to infer.
 * - no match — the model is working from a stale or paraphrased read.
 * - several matches without `replaceAll` — it must widen the context (or say it meant all).
 * - `oldText === newText` — a no-op reported as an edit is a lie the model then builds on.
 *
 * Matching is EXACT (no normalisation, no regex): `oldText` comes from the model, and a
 * model-supplied pattern that matched loosely would be an arbitrary rewrite primitive.
 */
export function applyEdit(
  content: string,
  oldText: string,
  newText: string,
  replaceAll = false,
): EditResult {
  if (!oldText) throw new Error("`oldText` ne peut pas être vide — indiquez le texte exact à remplacer.");
  if (oldText === newText) throw new Error("`oldText` et `newText` sont identiques — aucune modification à appliquer.");

  const occurrences = countOccurrences(content, oldText);
  if (occurrences === 0) {
    throw new Error(
      "`oldText` est introuvable dans le fichier. Relisez-le (`read_file`) et copiez le passage EXACT, espaces et indentation compris.",
    );
  }
  if (occurrences > 1 && !replaceAll) {
    throw new Error(
      `\`oldText\` apparaît ${occurrences} fois. Ajoutez des lignes autour pour rendre le passage unique, ou passez \`replaceAll: true\` pour les remplacer toutes.`,
    );
  }

  return {
    content: replaceAll ? content.split(oldText).join(newText) : replaceOnce(content, oldText, newText),
    occurrences,
  };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count += 1;
  return count;
}

function replaceOnce(content: string, oldText: string, newText: string): string {
  const at = content.indexOf(oldText);
  return content.slice(0, at) + newText + content.slice(at + oldText.length);
}

export interface LineSlice {
  text: string;
  /** 1-based line number of the first line returned (0 when nothing was returned). */
  from: number;
  /** 1-based line number of the last line returned (0 when nothing was returned). */
  to: number;
  /** True when the slice stopped on the byte cap rather than on `limit`/end-of-file. */
  cappedByBytes: boolean;
  /** True when the last line of the file is included — i.e. there is nothing after. */
  reachedEnd: boolean;
}

/**
 * Take `limit` lines starting at 1-based line `offset`, bounded by `maxBytes`.
 *
 * Takes an iterable (sync in tests, the worker's line stream in production) so a big
 * file is never materialised: memory is bounded by the SLICE, not by the file. That is
 * the whole point — before paging, a file over the read cap was not partially readable,
 * it was unreadable, and the model had no move left.
 */
export async function takeLines(
  lines: AsyncIterable<string> | Iterable<string>,
  offset: number,
  limit: number,
  maxBytes: number,
): Promise<LineSlice> {
  const start = Math.max(1, Math.floor(offset));
  const want = Math.max(0, Math.floor(limit));
  const out: string[] = [];
  let lineNo = 0;
  let bytes = 0;
  let cappedByBytes = false;
  let reachedEnd = true;

  for await (const line of lines) {
    lineNo += 1;
    if (lineNo < start) continue;
    if (out.length >= want) {
      reachedEnd = false; // there is at least one more line after the slice
      break;
    }
    const size = Buffer.byteLength(line, "utf8") + 1;
    if (bytes + size > maxBytes && out.length > 0) {
      cappedByBytes = true;
      reachedEnd = false;
      break;
    }
    bytes += size;
    out.push(line);
  }

  const from = out.length ? start : 0;
  return { text: out.join("\n"), from, to: from ? from + out.length - 1 : 0, cappedByBytes, reachedEnd };
}
