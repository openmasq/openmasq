import type { Detection } from "../types";
import { acceptFieldValue, cleanValue } from "./contextFields";

/**
 * The PHONE label **with no colon** — « Telefon 0734 82 57 190 »,
 * « Telefono 340 118 27 64 ». German and Italian glue the label to the number; the
 * international branch of `phones.ts` requires a `+` or a `00`, and the national branch
 * is specific to France. These numbers therefore had no detector.
 *
 * They were only SEEN by fixing the field detector's greedy capture: they
 * were until then "detected" by accident, by overlapping into the neighbouring
 * address value — the fake then erased the label and the number along with the address.
 * A correct span made the leak hiding behind it visible.
 *
 * ⚠️ **The guard is on the VALUE, never on the label.** Only a run of
 * digits and separators, ≥ 7 characters, NO letter. Without it « Mobile 12 mois
 * inclus » would become a phone number. This is also why the branch is
 * reserved for PHONE: it's the only category whose value can never carry a
 * letter, so the only one where a separator as weak as a space stays safe.
 *
 * Negatives and positives pinned in `contextFields.test.ts`.
 */
export function pushBarePhoneLabels(
  text: string,
  alt: string,
  seen: Set<string>,
  out: Detection[],
): void {
  // NBSP and narrow no-break space included: these are the group separators that
  // French PDF extraction emits verbatim.
  const re = new RegExp(
    `(?<![\\p{L}])(?:${alt})[^\\S\\r\\n]+((?:\\+|00)?\\d[\\d.()\\u00a0\\u202f -]{6,24}\\d)(?![\\d-])`,
    "giu",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ok = acceptFieldValue(cleanValue(m[1] ?? ""), "PHONE");
    if (!ok) continue;
    const key = `${ok.category}::${ok.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: ok.value, category: ok.category, start: m.index });
  }
}
