import type { Detection } from "../../types";
import { redactionCategory } from "../../kinds";
import { entityVariantRegex } from "../../util";

/**
 * A NAME/COMPANY candidate must not cross a FIELD boundary — a line break, or the COLUMN
 * GAP of a two-column layout. Split it at the pieces it actually spans.
 *
 * Why this happens: the NER reads a LIST (a team page: "Laure\nDPO\n\nVergnaud\nRED TEAM")
 * as prose and emits one glued span — "Muriel DPO Vergnaud" — and because substitution is
 * variant-tolerant (`entityVariantRegex` separators include the newline), that one span
 * really does redacted ACROSS the list items: two different people and a role label become
 * ONE fake, the audit's « Muriel DPO Vergnaud » chip. A line break in list-like text is a
 * FIELD boundary; no real person's name wraps across one in the inputs this engine sees.
 *
 * So: for each name/company candidate, find what its variant regex ACTUALLY matches in
 * the input; when a match contains a newline, the candidate is replaced by its per-line
 * pieces (same category). The pieces then ride the normal pipeline — a piece that is a
 * role word ("DPO") is dropped by the generic-terms gate, a name piece ("Laure",
 * "Arnault") gets its own identity, and a duplicate merges with its other occurrences.
 *
 * The COLUMN GAP is the same artefact seen horizontally. A payslip, a bilingual invoice
 * and a lab report all put two independent blocks side by side, and extraction hands them
 * over as ONE line separated by a run of spaces — so a candidate fused a company with the
 * next column's label ("BATIRENOV        Matricule") or a person with the neighbouring
 * block's company ("Matthias Wandelholz      Wandelholz Metallbau GmbH"). Unlike the
 * newline case the glued value DOES occur verbatim, so the occurrence check below can't
 * see it; a run of 2+ spaces (or a tab) inside a name is the tell. No real name or company
 * carries one — single spaces are untouched.
 *
 * Scope is deliberately NAME/COMPANY only:
 *  - ADDRESSES legitimately span lines ("12 rue X\n69003 Lyon") — never split;
 *  - numeric schemes own their wrap tolerance (`WRAP` + `maxOneWrap`) — untouched;
 *  - `forced` candidates are the user's explicit span — untouched.
 */
const SPLIT_CATEGORIES = new Set(["name", "company"]);

export function splitLineCrossing(candidates: Detection[], input: string): Detection[] {
  if (!input.includes("\n")) return candidates;
  const out: Detection[] = [];
  for (const c of candidates) {
    if (c.forced || !SPLIT_CATEGORIES.has(redactionCategory(c.category))) {
      out.push(c);
      continue;
    }
    // A COLUMN GAP inside the value: split there FIRST, and unconditionally — the glued
    // value occurs verbatim, so the occurrence check below would keep it whole.
    if (/[^\S\r\n]{2,}|\t/.test(c.value)) {
      const pieces = c.value
        .split(/[^\S\r\n]{2,}|\t/u)
        .map((v) => v.trim())
        .filter((v) => v && /\p{L}/u.test(v));
      // A single surviving piece means the gap was leading/trailing — keep the candidate
      // (trimmed), never drop it: dropping a candidate is what ships a value in clear.
      if (pieces.length) {
        for (const piece of pieces) out.push({ ...c, value: piece });
        continue;
      }
    }
    // Where does this value ACTUALLY sit in the text? Verbatim occurrence somewhere
    // ⇒ the value exists on one line too — keep the candidate as-is (the variant
    // machinery handles the rest); only a value that ONLY exists across lines splits.
    if (input.includes(c.value)) {
      out.push(c);
      continue;
    }
    const re = entityVariantRegex(c.value);
    const matches: string[] = [];
    if (re) {
      for (let m = re.exec(input); m; m = re.exec(input)) {
        matches.push(m[0]);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    const crossing = matches.filter((m) => m.includes("\n"));
    if (!crossing.length) {
      out.push(c);
      continue;
    }
    // Replace the glued candidate by the per-line pieces of every crossing match.
    const pieces = new Set<string>();
    for (const m of crossing) {
      for (const line of m.split(/\r?\n/)) {
        const piece = line.trim();
        // Letters required — a separator-only or numeric residue is not a name piece.
        if (piece && /\p{L}/u.test(piece)) pieces.add(piece);
      }
    }
    for (const piece of pieces) out.push({ ...c, value: piece });
  }
  return out;
}
