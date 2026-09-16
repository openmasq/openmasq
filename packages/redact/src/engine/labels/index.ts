// Multilingual "label → value" detector: administrative documents and forms write
// `Field : value`, a NER often MISSES such values in dense form context, but the LABEL is a
// strong language-scoped signal — if a line is introduced by a known sensitive field name,
// its value is sensitive whatever its shape. Coverage grows by adding label terms per
// language. Only the value is emitted; the label stays in clear.
import type { Detection } from "../../types";
import { isStopword, isGenericTerm } from "../../model/detect";
import { LABEL_GROUPS, labelOf } from "./terms";
import { pushBarePhoneLabels } from "./phoneLabel";
import { acceptFieldValue, cleanValue } from "./values";

export { detectSelfHandles } from "./selfProse";
// Re-export: the value guard lives in `values.ts`; `labelBlocks.ts` and the tests import it from here.
export { acceptFieldValue, cleanValue } from "./values";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `**` / `__` / `*` / `_` — markdown emphasis, tolerated around the separator only. */
const EMPH = `(?:\\*{1,2}|_{1,2})?`;
/** « number / no. / nr / n° » after a label, in prose (« Fax Number: »). */
const NUM_MARK = `(?:[^\\S\\r\\n]+(?:number|numbers|no|nr|num|n[°ºo])\\.?)?`;

/**
 * Detect sensitive `label : value` fields. Returns the VALUES as verbatim
 * `{value, category}` detections. Values that are empty, a lone function/generic
 * word, or placeholder-ish ("N/A", "-") are dropped.
 */
export function detectLabeledFields(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const group of LABEL_GROUPS) {
    // A prose label's words may be joined by a space, an underscore, a dash — or the
    // markdown-escaped underscore a renderer leaves (`swift\_bic\_code:`): ONE joiner.
    const alt = group.terms.map((t) => escape(t).replace(/ /g, "(?:[ _-]|\\\\_)")).join("|");
    // Label at a word boundary, then an optional PLURAL `s` and an optional short
    // PARENTHETICAL — identity documents write "Prénom(s) :", and OCR routinely drops the
    // opening paren ("Prénomis):"). The orphan branch is GLUED on purpose: with a leading
    // space it read a following WORD as part of the label. Then a colon (or fullwidth), or a
    // DOTTED LEADER of ≥4 dots (a prose ellipsis never reads as a label), and the value on
    // the SAME line ([^\S\r\n], never \s: a colon at end-of-line must not capture the NEXT
    // line). Case-insensitive, Unicode.
    // A QUALIFIER between label and colon, for the ID group ONLY (« Identifiant du Projet
    // Crédit : 02799195 »): at most 3 letter-words of ≤ 12 chars so it can't cross a clause,
    // and the value still goes through `acceptFieldValue`. The other groups' false-positive
    // surface hasn't been measured.
    const qualif = group.category === "ID" ? `(?:[^\\S\\r\\n]+[\\p{L}]{1,12}){0,3}` : "";
    // A « number » MARK after any label (« Fax Number: »), and MARKDOWN EMPHASIS on either
    // side of the separator (`- **Label:** value`), which sat exactly where the matcher
    // wanted whitespace.
    const re = new RegExp(
      // Separator: colon (or fullwidth), a ≥4-dot leader, or a single `=` (the config/props
      // idiom `pseudo = kaelith92`). `==` is excluded by the (?!=) guard, and cleanValue
      // strips a stray leading `=`.
      `(?<![\\p{L}])(?:${alt})s?(?:[^\\S\\r\\n]*\\(\\s*[\\p{L}]{0,10}\\s*\\)|[\\p{L}]{1,10}\\))?${qualif}${NUM_MARK}${EMPH}[^\\S\\r\\n]*(?:[:：]|=(?!=)|\\.{4,})${EMPH}[^\\S\\r\\n]*([^\\n\\r]{2,120})`,
      "giu",
    );
    // The PHONE label without a colon (« Telefon 0721 … ») has its own branch.
    if (group.category === "PHONE") pushBarePhoneLabels(text, alt, seen, out);

    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const rawValue = m[1] ?? "";
      // Resume the scan at the START of the captured value: the capture is greedy to
      // end-of-line and would swallow the next label of a `Nom: X | Prénom: Y` row. The
      // cursor strictly advances, so no infinite loop.
      re.lastIndex = m.index + (m[0].length - rawValue.length);
      // Canonicalising, trimming, the FP gates and the CITY→PLACE promotion are all
      // `acceptFieldValue`, shared with the other passes (rule 9).
      const ok = acceptFieldValue(cleanValue(rawValue), group.category, group.numeric);
      if (!ok) continue;
      const { value, category } = ok;
      const key = `${category}::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value, category, start: m.index });
    }
    // VERTICAL form — the label ALONE on its line, the value on the NEXT (PDF extraction
    // stacks form cells this way). Precision: the label line must contain NOTHING else
    // (qualifier words only if stopword/generic), and the value line reuses every gate.
    // ⚠️ Template literal: `\S`/`\p` MUST be double-escaped or the STRING layer eats the
    // backslash and `[^\S\r\n]` silently becomes "anything but a capital S", which kills the
    // "label ALONE" guard. `contextFields.test.ts` pins the repro.
    const vre = new RegExp(
      `(?<=^|\n)[ \t]*${EMPH}(?:${alt})s?((?:[^\\S\r\n]+[\\p{L}'’]+){0,3})${EMPH}[^\\S\r\n]*[:：]?${EMPH}[ \t]*\r?\n[ \t]*([^\n\r]{2,80})`,
      "giu",
    );
    let vm: RegExpExecArray | null;
    while ((vm = vre.exec(text)) !== null) {
      const qualifiers = (vm[1] ?? "").trim().split(/[\s'’]+/u).filter(Boolean);
      if (!qualifiers.every((q) => isStopword(q) || isGenericTerm(q))) continue;
      const rawV = cleanValue(vm[2] ?? "");
      if (rawV.length > 40) continue;
      // The value line must not itself be a LABEL line ("Nom\nPrénom\nMamadou"): a value
      // carrying a colon reads as another field, and « Prénom » is a form word the generic
      // deny-list does not cover. `labelOf` is the same test the BLOCK pass uses.
      if (/[:：]/.test(rawV) || labelOf(rawV)) continue;
      const okv = acceptFieldValue(rawV, group.category, group.numeric);
      if (!okv) continue;
      const { value, category } = okv;
      const key = `${category}::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value, category, start: vm.index });
    }
    // SERIALISED form — a QUOTED key/value pair: JSON `"prenom":"Élodie"`, YAML/TOML
    // `ville: "Blagnac"`, a query dump `nom='Vernaux'`. A log or an API payload is DENSE with
    // personal data, and the inline form needs the label glued to its colon. The VALUE's own
    // quotes bound the capture exactly. Same gates as the inline form, `CODE_IDENT` included.
    // ⚠️ The vocabulary is written as WORDS SEPARATED BY SPACES whereas a serialised key is
    // `postal_code`, `postalCode`, `postal-code` or `postalcode`: each space becomes
    // `[\s_-]*`, and the BACKSLASH of a markdown-escaped key (`swift\\_bic\\_code:`) too.
    const flex = (t: string) => escape(t).replace(/ /g, "[\\\\\\s_-]*");
    // `serialisedOnly` keys are admitted ONLY in this context: the quoted key/value
    // pair is the proof that « cp » denotes a postal code and nothing else.
    const qalt = [...group.terms, ...(group.serialisedOnly ?? [])]
      .sort((a, b) => b.length - a.length)
      .map(flex)
      .join("|");
    // A serialised key may wear an IDENTIFIER SUFFIX the prose label never does
    // (`Telefonnummer_id`, `TeacherID`, `customer-no`). Tolerated only here.
    const KEY_SUFFIX = `(?:[_\\\\\\s-]?(?:id|nr|no|num|number|nummer|code))?`;
    const qre = new RegExp(
      `(?<![\\p{L}])["'\`]?(?:${qalt})s?${KEY_SUFFIX}["'\`]?[^\\S\\r\\n]*[:=][^\\S\\r\\n]*["'\`]([^"'\`\\n\\r]{2,120})["'\`]`,
      "giu",
    );
    // …and the XML ELEMENT form — `<Username>manaka</Username>` — where the tag IS the label
    // and the closing `<` bounds the value exactly. Attributes are tolerated.
    // ⚠️ Only `<` bounds the value — `>` is an ORDINARY character inside it, or every
    // password made of punctuation (`<Password>2P~e>A</Password>`) ships in clear.
    const xre = new RegExp(
      `<\\s*(?:${qalt})s?${KEY_SUFFIX}(?:\\s[^<>]{0,80})?>\\s*([^<\\n\\r]{1,120}?)\\s*<\\s*/`,
      "giu",
    );
    // …and the MARKDOWN TABLE CELL — `| Certificate License Number | CERT-835201 |` — where
    // the label is one cell and the value the next, both bounded by pipes: the same proof
    // again. A header row (`| Name | Phone |`) offers a LABEL as the value and is refused
    // by `labelOf`, the separator row (`|---|`) by the placeholder gate.
    const tre = new RegExp(
      `\\|[^\\S\\r\\n]*${EMPH}(?:${qalt})s?${KEY_SUFFIX}${EMPH}[^\\S\\r\\n]*\\|[^\\S\\r\\n]*${EMPH}([^|\\n\\r]{1,120}?)${EMPH}[^\\S\\r\\n]*\\|`,
      "giu",
    );
    for (const re2 of [qre, xre, tre]) {
      let qm: RegExpExecArray | null;
      while ((qm = re2.exec(text)) !== null) {
        const rawQ = (qm[1] ?? "").trim();
        // A header row offers the NEXT column's name as the value (`| email | full_name |`) —
        // read with its joiners as spaces, it is a label, and refused.
        if (re2 === tre && labelOf(rawQ.replace(/[_-]/gu, " "))) continue;
        const okq = acceptFieldValue(rawQ, group.category, group.numeric);
        if (!okq) continue;
        const { value, category } = okq;
        const key = `${category}::${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value, category, start: qm.index });
      }
    }
  }
  return out;
}

export {
  detectAccountNumbers,
  detectFiscalNumbers,
  detectContractNumbers,
} from "./numbers";
export { detectLabeledCodes } from "./codes";
