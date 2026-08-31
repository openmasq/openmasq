/**
 * Normalization of arguments that models fill in WRONG.
 *
 * A "list of strings" field arrives in three shapes depending on the model: the expected
 * array, a comma-separated string, or — this is the trap — a JSON array
 * ENCODED AS A STRING. Journal entry from 27/07/2026:
 *
 *   "attendees": "[\"Équipe produit\"]"
 *
 * `Array.isArray` returns `false`, the field is silently DROPPED, the event
 * is created with no participants and nothing informs the model — the worst
 * outcome: a successful write, amputated, with no one to say so.
 *
 * Same philosophy as Gmail's `to`/`cc`/`bcc` declaration (`google/gmailSend.ts`):
 * we announce to the model the simplest shape to fill, and we ACCEPT the others.
 */

/** A JSON array encoded as a string: `'["a", "b"]'`. */
function parseJsonArray(s: string): unknown[] | null {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return null;
  try {
    const v: unknown = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Brings a value down to a list of non-empty strings, whatever shape it arrives in:
 * array, JSON array encoded as a string, or a comma- or semicolon-separated
 * string. A non-string entry inside an array is ignored.
 *
 * ⚠️ Only splits a STRING if it isn't a JSON array: `'["a, b"]'` yields
 * `["a, b"]` (one entry), not two — the comma there belongs to the value.
 */
export function stringList(v: unknown): string[] {
  const raw: unknown[] = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? (parseJsonArray(v) ?? v.split(/[,;]/))
      : [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
}
