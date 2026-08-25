import { isWordGlued, escapeRegExp } from "@openmasq/redact";
import type { PdfReplacement } from "../pdf/pdfReplacements";

/** One segment of a document's redacted text: plain (`real` absent) or a redacted
 *  value shown as its FAKE (default) or its REAL value when `revealed`. */
export interface DocSeg {
  text: string;
  /** The real value (present ⇒ this is a clickable redaction segment). */
  real?: string;
  tone?: string;
  /** The FINE category of the value (name/email/…), for the hover type chip. */
  kind?: string;
  revealed?: boolean;
}


/**
 * Split `text` (the ORIGINAL extracted document text) into plain + redaction
 * segments from `replacements` (real→fake+tone). A redaction segment renders the
 * FAKE by default, or the REAL value when its real is in `revealed` — i.e. EXACTLY
 * what leaves the machine after the user's per-value reveals. Longest real first so
 * a value isn't split by a shorter substring of it. Pure + unit-tested.
 */
export function docRevealSegments(
  text: string,
  replacements: PdfReplacement[],
  revealed: ReadonlySet<string>,
): DocSeg[] {
  const reps = replacements.filter((r) => r.real).sort((a, b) => b.real.length - a.real.length);
  if (!reps.length || !text) return [{ text }];
  const byReal = new Map(reps.map((r) => [r.real, r]));
  const re = new RegExp(reps.map((r) => escapeRegExp(r.real)).join("|"), "g");

  const segs: DocSeg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // SKIP a match GLUED inside a larger word — a short fake ("mail" from Gmail/Email)
    // must not replace the substring inside "email"/"gmail"/"producer", which swapped
    // only an email's DOMAIN and leaked its real local-part (`x@gVoxa.com`). Mirrors the
    // model-facing `applyVault`'s `isWordGlued` guard, which this preview lacked. Left in
    // the plain run (don't advance `last`) so the surrounding text renders verbatim.
    if (isWordGlued(text, m.index, m[0])) {
      if (m[0].length === 0) re.lastIndex++;
      continue;
    }
    if (m.index > last) segs.push({ text: text.slice(last, m.index) });
    const rep = byReal.get(m[0])!;
    const isRevealed = revealed.has(rep.real);
    segs.push({
      text: isRevealed ? rep.real : rep.fake,
      real: rep.real,
      tone: rep.tone,
      kind: rep.kind,
      revealed: isRevealed,
    });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  return segs;
}
