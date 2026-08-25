// Multilingual "label → value" detector. Administrative documents and forms put
// sensitive data as `Field : value` (`Dénomination : Karl Studio`, `Name: John
// Welby`, `Adresse : 12 rue …`). A specialised NER model often MISSES such values
// in dense form context, and a regex can't know a bare token is a company. But the
// LABEL is a strong, language-scoped signal: if a line is introduced by a known
// sensitive field name, its value is sensitive — whatever its shape.
//
// This is deterministic and LANGUAGE-AGNOSTIC by construction: coverage grows by
// adding label terms per language (FR/EN/DE/ES/IT/PT/NL seeded here). Only the
// value is emitted; the label stays in clear (it carries no PII and helps the
// chat model understand the structure).
import type { Detection } from "../types";
import { isStopword, isGenericTerm } from "../model/detect";
import { LABEL_GROUPS, labelOf } from "./contextFields.labels";
import { pushBarePhoneLabels } from "./contextFields.phoneLabel";
import { acceptFieldValue, cleanValue } from "./contextFields.values";

export { detectSelfHandles } from "./contextFields.selfProse";
// Ré-export : la garde de valeur a déménagé dans `contextFields.values.ts` (cap 300 LOC),
// le NOM public ne bouge pas — `labelBlocks.ts` et les tests l'importent d'ici.
export { acceptFieldValue, cleanValue } from "./contextFields.values";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    const alt = group.terms.map(escape).join("|");
    // Label at a word boundary, then an optional PLURAL `s` and an optional short
    // PARENTHETICAL — identity documents write "Prénom(s) :" / "Nom(s)", and OCR
    // routinely drops the opening paren ("Prénomis):" was reported LEAKING "JULIEN
    // LOUIS"). Two suffix branches, both `)`­-terminated: a real parenthetical
    // (`(s)`, `(usage)` — whitespace allowed before the `(`), or the OCR orphan —
    // 1-10 letters GLUED to the term then `)`. The orphan branch is GLUED on
    // purpose: with a leading space it read a following WORD as part of the label
    // ("…réciter tel quel) :" → "tel"+" quel)" = a PHONE label — the Mémoire
    // header trap), and a term merely sitting INSIDE parens
    // (`Karl Studio (organisation) : devis`) can never read as label+`)`.
    // Then a colon (`:` or fullwidth `：`) — or a DOTTED LEADER of ≥4 dots, the
    // form idiom ("Code postal ......... 44000"; ≥4 so a prose ellipsis "..."
    // never reads as a label) — and the value: label, separator and value on the
    // SAME line ([^\S\r\n], never \s: a colon at end-of-line must not capture the
    // NEXT line as its "value"). Case-insensitive, Unicode.
    // ⚠️ Un QUALIFICATIF entre le libellé et le deux-points — mais pour le groupe ID SEUL.
    // Mesuré le 15/08/2026 sur un accord de principe réel : « Identifiant du Projet
    // Crédit : 02799195 » n'accrochait pas, alors que « Identifiant : … » accroche — le
    // libellé devait finir JUSTE avant le séparateur. Or un document d'entreprise qualifie
    // toujours ses identifiants (« du Projet Crédit », « client », « de facturation »).
    // Borné : au plus 3 mots de lettres, chacun ≤ 12 caractères, donc le qualificatif ne
    // peut pas traverser une clause ; et la valeur reste soumise à `acceptFieldValue`
    // (≥ 2 caractères, un chiffre exigé pour un champ numérique), ce qui écarte
    // « Identifiant de la page : 3 ». Les autres groupes ne bougent pas — leur surface de
    // faux positifs n'a pas été mesurée.
    const qualif = group.category === "ID" ? `(?:[^\\S\\r\\n]+[\\p{L}]{1,12}){0,3}` : "";
    const re = new RegExp(
      // Separator: colon (or fullwidth), a ≥4-dot leader — or a single `=`, the
      // config/props idiom (`pseudo = kaelith92`). `=` was only understood in the
      // UPPER_SNAKE env rule and the QUOTED serialised form; an unquoted lowercase
      // assignment leaked. `==` (a comparison) is excluded by the (?!=) guard, and
      // cleanValue strips a stray leading `=` so `a == b` can't yield "= b".
      `(?<![\\p{L}])(?:${alt})s?(?:[^\\S\\r\\n]*\\(\\s*[\\p{L}]{0,10}\\s*\\)|[\\p{L}]{1,10}\\))?${qualif}[^\\S\\r\\n]*(?:[:：]|=(?!=)|\\.{4,})[^\\S\\r\\n]*([^\\n\\r]{2,120})`,
      "giu",
    );
    // Le libellé TÉLÉPHONE sans deux-points (« Telefon 0721 … ») a sa propre branche.
    if (group.category === "PHONE") pushBarePhoneLabels(text, alt, seen, out);

    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const rawValue = m[1] ?? "";
      // Resume the scan at the START of the captured value, not after it: the value
      // capture is greedy to end-of-line, so `Nom: MORVAN | Prénom: Julie` consumed
      // « Prénom » inside NOM's value and the second label was never examined —
      // every row of a header-annotated table lost its non-first fields. The cursor
      // strictly advances (past the label + separator), so no infinite loop.
      re.lastIndex = m.index + (m[0].length - rawValue.length);
      // Canonicalising an ORG value, trimming a NAME, the FP gates and the CITY→PLACE
      // promotion are all `acceptFieldValue` — shared with the vertical, serialised and
      // BLOCK passes so no copy of the gate can drift (rule 9).
      const ok = acceptFieldValue(cleanValue(rawValue), group.category);
      if (!ok) continue;
      const { value, category } = ok;
      const key = `${category}::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value, category, start: m.index });
    }
    // VERTICAL form — the label ALONE on its line, the value on the NEXT line
    // ("Nom de l'étudiant\nBAGAYO" on certificates; PDF extraction stacks form
    // cells this way). The inline rule above requires label and value on ONE line,
    // so these shipped in clear. Precision: the label line must contain NOTHING
    // else (qualifier words allowed only if stopword/generic — « de l'étudiant »),
    // and the value line reuses every inline gate below.
    // ⚠️ Template literal: `\S`/`\p` MUST be double-escaped or the STRING layer eats the
    // backslash and the class silently degrades — `[^\S\r\n]` became `[^S\r\n]` ("anything
    // but a capital S"), which swallowed « : 2022B44821 » after the label, killed the
    // "label ALONE on its line" guard, and tagged the FIRST WORD of the next line as the
    // value (« Numéro Gestion : 2022B44821\nForme Juridique » → "Forme" vaulted as an ID —
    // the RCS-receipt false positive). `contextFields.test.ts` pins the repro.
    const vre = new RegExp(
      `(?<=^|\n)[ \t]*(?:${alt})s?((?:[^\\S\r\n]+[\\p{L}'’]+){0,3})[^\\S\r\n]*[:：]?[ \t]*\r?\n[ \t]*([^\n\r]{2,80})`,
      "giu",
    );
    let vm: RegExpExecArray | null;
    while ((vm = vre.exec(text)) !== null) {
      const qualifiers = (vm[1] ?? "").trim().split(/[\s'’]+/u).filter(Boolean);
      if (!qualifiers.every((q) => isStopword(q) || isGenericTerm(q))) continue;
      const rawV = cleanValue(vm[2] ?? "");
      if (rawV.length > 40) continue;
      // The value line must not itself be a LABEL line ("Nom\nPrénom\nMamadou" stacks
      // two labels: the first's "value" is the second label) — a value carrying a colon
      // reads as another field, not a value. The generic deny-list does NOT cover this:
      // « Prénom » is a form word, not an institutional noun, so a two-line label stack
      // vaulted the word "Prénom" as a person and then redact every later occurrence
      // of it. `labelOf` is the same test the BLOCK pass uses (one vocabulary, one rule).
      if (/[:：]/.test(rawV) || labelOf(rawV)) continue;
      const okv = acceptFieldValue(rawV, group.category);
      if (!okv) continue;
      const { value, category } = okv;
      const key = `${category}::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value, category, start: vm.index });
    }
    // SERIALISED form — a QUOTED key/value pair: JSON `"prenom":"Élodie"`, YAML/TOML
    // `ville: "Blagnac"`, a query dump `nom='Vernaux'`. An application LOG or an API
    // payload is an ordinary thing to paste into a chat ("pourquoi cette requête
    // échoue ?"), and it is DENSE with personal data — yet the whole record shipped in
    // CLEAR: the inline form needs the label glued to its colon, and a JSON key wears a
    // closing quote in between. The VALUE's own quotes are what make this safe to add —
    // they bound the capture exactly, so no greedy run swallows the rest of the record
    // (`"nom":"Vernaux","prenom":…`). Same gates as the inline form below, `CODE_IDENT`
    // included: `"name": "read-data-schema"` in MCP tool metadata stays a tool id.
    // ⚠️ Le vocabulaire est écrit en MOTS SÉPARÉS PAR DES ESPACES (« postal code »,
    // « date de naissance ») alors qu'une clé sérialisée s'écrit `postal_code`,
    // `postalCode`, `postal-code` ou `postalcode`. C'était LA cause du plafond mesuré :
    // `POSTAL` restait à 67 % sur les retours d'outils, non par manque de vocabulaire mais
    // parce qu'aucune clé ne pouvait matcher. Remplacer chaque espace par `[\s_-]*` couvre
    // les quatre conventions d'un coup — et évite d'énumérer cinquante variantes à la main.
    const flex = (t: string) => escape(t).replace(/ /g, "[\\s_-]*");
    // Les clés `serialisedOnly` ne sont admises QUE dans ce cadre : la paire clé/valeur
    // quotée est la preuve que « cp » désigne un code postal et pas autre chose.
    const qalt = [...group.terms, ...(group.serialisedOnly ?? [])]
      .sort((a, b) => b.length - a.length)
      .map(flex)
      .join("|");
    const qre = new RegExp(
      `(?<![\\p{L}])["'\`]?(?:${qalt})s?["'\`]?[^\\S\\r\\n]*[:=][^\\S\\r\\n]*["'\`]([^"'\`\\n\\r]{2,120})["'\`]`,
      "giu",
    );
    let qm: RegExpExecArray | null;
    while ((qm = qre.exec(text)) !== null) {
      const okq = acceptFieldValue((qm[1] ?? "").trim(), group.category);
      if (!okq) continue;
      const { value, category } = okq;
      const key = `${category}::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value, category, start: qm.index });
    }
  }
  return out;
}

export {
  detectAccountNumbers,
  detectFiscalNumbers,
  detectContractNumbers,
} from "./contextFields.numbers";
