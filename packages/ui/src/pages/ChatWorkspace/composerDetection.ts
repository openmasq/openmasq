import type { Messages } from "@openmasq/i18n";
import { redact, hueForKind, entityVariantRegex, entityKey } from "@openmasq/redact";
import { captureEvent } from "../../analytics";
import { dropNested } from "./composerNesting";

// The composer's live-redaction DETECTION logic — pure, React-free, pulled out of
// Composer.tsx so the highlight math is testable in isolation from the component.

/** A detected sensitive span: char range [start, end) + value + its FAMILY hue
 *  (from the shared `hueForKind`, so the composer highlight matches the app).
 *  `uncertain` = « à vérifier » : the engine flagged this span as a weak single-source
 *  detection (see `Detection.uncertain` in @openmasq/redact) — styled distinctly so the
 *  user reviews it, while staying redacted unless they keep it in clear (fail closed). */
export type Detected = { start: number; end: number; value: string; hue: string; uncertain?: boolean };
/** A distinct detected value (for the un-redact chips) + its family hue. */
export type Item = { value: string; hue: string; kind?: string; uncertain?: boolean };
/** A detected value + the category/type used to pick its family hue — the common
 *  currency of both the regex layer and the async model layer, so they merge. */
export type Cat = { value: string; cat: string; uncertain?: boolean };
/** `off` = the segment's start offset in the input, used as a STABLE React key so
 *  an unchanged mark isn't remounted (→ its appear-animation plays once, not on
 *  every keystroke). */
type Seg = { text: string; mark?: boolean; off: number; hue?: string; uncertain?: boolean };

/** Debounce before the live redaction detection runs. Bigger than a keystroke
 *  so a burst of typing settles first — sized for the heavier (model-based) layer
 *  to slot in later; the synchronous regex layer resolves well within it. */
export const DETECT_DEBOUNCE_MS = 350;
/** Debounce before the heavier async model/local/remote detection layer runs —
 *  larger than the regex layer's so a burst of typing settles before a model call. */
export const MODEL_DEBOUNCE_MS = 900;
/** Upper bound on one async detection so a hung model/endpoint never leaves the
 *  send button blocked; on timeout we abort the call and keep the regex layer. */
export const MODEL_DETECT_TIMEOUT_MS = 20000;

/**
 * Fast, SYNCHRONOUS detection of what would be redacted in `text` — the regex
 * layer of the engine (emails, phones, cards, IBANs, keys, filesystem paths…),
 * no model call. Returns each detected value + its type (for the family-hue lookup).
 * Free-form PII (names/orgs) needs the model — the async `onDetectPii` layer adds it.
 *
 * ⚠️ **`disabledKinds` is not optional in practice.** This layer used to call `redact`
 * with no options, so it highlighted and counted categories the user had turned OFF —
 * and on the `patterns` engine it is the ONLY layer that runs (`ChatView` passes no
 * `onDetectPii` there), so the redaction rules had no visible effect at all. The send
 * always honoured them (`send/redactionOptions.ts`); it was the preview that lied, on
 * the one surface whose whole job is to be trusted. Pass the SAME `disabledKinds` the
 * send computes — `disabledKindsOf(effectiveRedactCategories(…))`, one home.
 */
export function detectRegex(text: string, disabledKinds?: readonly string[]): Cat[] {
  return redact(text, disabledKinds?.length ? { disabledKinds: [...disabledKinds] } : undefined)
    .matches.filter((m) => m.value)
    .map((m) => ({ value: m.value, cat: m.type }));
}

/**
 * Turn merged detections into the chips (distinct VALUES + hue) and the highlight
 * RANGES (every occurrence in `text`), family-coloured via `hueForKind`. Deduped by
 * value (first `cat` wins), so the synchronous regex layer and the async model layer
 * combine into one coherent highlight.
 */
// Entity kinds (names/orgs/places…) are matched across ALL spelling variants — casing,
// spacing, hyphen/underscore, glued; structured values (numbers/emails/keys) stay exact.
const ENTITY_CATS = new Set(["name", "company", "location", "address", "health", "username"]);

export function buildDetection(text: string, cats: Cat[]): { items: Item[]; ranges: Detected[] } {
  const ranges: Detected[] = [];
  const items: Item[] = [];
  const seen = new Set<string>();
  /** Chaque valeur retenue avec SES occurrences — l'imbrication se juge après la boucle,
   *  quand on connaît les spans de tout le monde. */
  const found: { item: Item; mine: Detected[] }[] = [];
  for (const { value, cat, uncertain } of cats) {
    if (!value) continue;
    const isEntity = ENTITY_CATS.has(cat);
    // ONE chip per entity IDENTITY (all spelling variants share a chip), else per value.
    // First `cat` wins the dedup — forced entries are merged FIRST by the composer and
    // the regex layer before the model layer, so a value any SURE source claims can
    // never end up wearing the model layer's « à vérifier » state. ⚠️ La catégorie ne
    // fait PAS partie de la clé : un terme du Coffre (pseudo) que la couche modèle
    // reclasse « company » est le MÊME terme — deux pastilles de deux teintes au-dessus
    // d'un seul faux alloué, c'est l'aperçu qui ment (le fil, value-keyed, tient l'unité).
    const key = isEntity ? `e|${entityKey(value)}` : value;
    if (seen.has(key)) continue;
    seen.add(key);
    const hue = hueForKind(cat);
    // Collect THIS value's occurrences first. Highlight EVERY spelling variant of an
    // entity (so "Karl Studio" AND "Karl studio" AND "KarlStudio" all light up, not just
    // the exact casing the detector returned).
    const mine: Detected[] = [];
    const re = isEntity ? entityVariantRegex(value) : null;
    if (re) {
      for (let m = re.exec(text); m; m = re.exec(text)) {
        mine.push({ start: m.index, end: m.index + m[0].length, value: m[0], hue, uncertain });
        if (m.index === re.lastIndex) re.lastIndex++; // guard a zero-width match
      }
    } else {
      for (let i = text.indexOf(value); i !== -1; i = text.indexOf(value, i + value.length)) {
        mine.push({ start: i, end: i + value.length, value, hue, uncertain });
      }
    }
    // A value that is NOT in the current prompt (e.g. a per-conversation FORCED redaction
    // whose text was deleted, or a stale detection) shows NO chip — it simply disappears
    // instead of lingering as an un-clearable disabled toggle.
    if (mine.length === 0) continue;
    found.push({ item: { value, hue, kind: cat, uncertain }, mine });
  }
  // Une valeur imbriquée dans une autre ne fait pas sa propre pastille : `composerNesting.ts`
  // (le pourquoi y est, avec sa mesure).
  for (const { item, mine } of dropNested(found)) {
    items.push(item);
    ranges.push(...mine);
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  return { items, ranges };
}

/** Above this many characters the inline chatbox COLLAPSES to a summary card and the
 *  editing moves to the modal editor — a pasted document in a 200px window is
 *  unnavigable, and the per-keystroke mirror repaint gets heavy. */
export const LONG_TEXT_THRESHOLD = 4000;

/** Above this many characters the live highlight MIRROR turns off (the modal editor
 *  becomes a plain fast textarea): repainting thousands of segment spans per keystroke
 *  lags typing long before the textarea itself does. Detection keeps running — the
 *  chips, the « N à redact » counter and the SEND-time guarantee are unchanged;
 *  only the in-place colouring pauses, and returns below the threshold. */
export const MIRROR_MAX_CHARS = 30000;

/** The collapsed card's summary of a long draft: size, line count, first line. */
export function longTextStats(text: string): { chars: number; lines: number; preview: string } {
  const firstLine = text.slice(0, 400).split("\n").find((l) => l.trim()) ?? "";
  return {
    chars: text.length,
    lines: text.split("\n").length,
    preview: firstLine.length > 120 ? `${firstLine.slice(0, 120)}…` : firstLine,
  };
}

/**
 * The NON-kept mark containing the caret, if any — the direct un-redact gesture: a
 * CLICK on a highlighted word offers « garder en clair » right there, instead of
 * hunting its chip in a long row. Collapsed-caret only (a drag is the force-redact
 * selection); `end` is exclusive but a caret AT the end still counts (clicking the
 * last character of a word puts the caret after it).
 */
export function markAtCaret(ranges: Detected[], keep: Set<string>, caret: number): Detected | null {
  if (caret < 0) return null;
  return ranges.find((r) => !keep.has(r.value) && caret >= r.start && caret <= r.end) ?? null;
}

/** Resolve a clicked OCCURRENCE to its CHIP-level value: an entity range may carry a
 *  casing/glue variant ("karl studio") of the chip's value ("Karl Studio"), and the
 *  keep-list is keyed on the chip's — same identity fold as `buildDetection`. */
export function chipValueFor(items: Item[], occurrence: string): string {
  if (items.some((i) => i.value === occurrence)) return occurrence;
  const k = entityKey(occurrence);
  return items.find((i) => entityKey(i.value) === k)?.value ?? occurrence;
}

/**
 * Split `text` into plain / marked segments. `ranges` may lag the text by the
 * debounce, so each is clamped and overlaps are skipped — the concatenated
 * segment TEXT always equals `text` (so the backdrop never misaligns the box),
 * only the highlight positions can be briefly stale after a mid-string edit.
 * A value in `keep` (the user un-redacted it) is NOT highlighted — it falls back
 * into the surrounding plain text.
 */
export function splitDetected(text: string, ranges: Detected[], keep: Set<string>): Seg[] {
  if (!text) return [{ text: "", off: 0 }];
  const out: Seg[] = [];
  let cursor = 0;
  for (const r of ranges) {
    const cs = Math.min(Math.max(r.start, 0), text.length);
    const ce = Math.min(Math.max(r.end, 0), text.length);
    if (cs < cursor || cs >= ce) continue;
    if (keep.has(r.value)) continue; // un-redacted → stays plain
    if (cs > cursor) out.push({ text: text.slice(cursor, cs), off: cursor });
    out.push({ text: text.slice(cs, ce), mark: true, off: cs, hue: r.hue, uncertain: r.uncertain });
    cursor = ce;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), off: cursor });
  return out.length ? out : [{ text, off: 0 }];
}

/**
 * Ce que le composeur doit AFFICHER de son propre état d'analyse.
 *
 * L'aperçu a deux couches : les règles déterministes, synchrones, puis le NER qui arrive
 * ~1 s plus tard. C'est la surface qui sert à FAIRE CONFIANCE, donc elle n'a pas le droit
 * d'annoncer un compte qu'elle n'a pas fini de calculer : tant qu'une couche travaille,
 * elle se tait — « 2 à redact » à mi-analyse se lit comme un total.
 *
 * ⚠️ Ce silence n'est PAS un vide : `detecting` est exactement la fenêtre pendant laquelle
 * le bouton d'envoi affiche « Redaction » (spinner, envoi bloqué). Le travail en cours
 * reste donc visible — c'est ce bouton, et lui seul, qui le montre. Rendre cette pastille
 * bavarde à nouveau ferait deux indicateurs pour un seul état.
 */
export type PreviewStatus =
  | { kind: "count"; label: string; partial?: boolean; hint?: string }
  | { kind: "none" };

/**
 * ⚠️ **`partial` distingue FINI d'ABANDONNÉ, et c'est tout l'objet du garde ci-dessus.**
 * La couche 2 (sémantique) est bornée dans le temps ; quand elle rend les armes sur un
 * document long, `detecting` retombe à faux et le compte des RÈGLES SEULES s'affichait
 * comme un total. Mesuré le 15/08 : 41 872 caractères ⇒ « 321 à redact », soit
 * exactement les e-mails + téléphones + le SIREN — pendant que l'adresse du cabinet et
 * les noms de personnes, détectés sur le même texte en court, manquaient à l'appel.
 * Ce n'est pas une fuite (l'envoi ré-analyse tout et fail-close), mais l'utilisateur
 * validait un chiffre ferme sur la seule surface où il vérifie, et justement sur les
 * documents qu'il ne peut pas relire lui-même.
 */
export function previewStatus(
  detecting: boolean,
  count: number,
  hasText: boolean,
  t: Messages,
  partial = false,
): PreviewStatus {
  if (!hasText || detecting) return { kind: "none" };
  // Abandon SANS aucune détection : « au moins 0 » ne veut rien dire, et se taire
  // laisserait croire « rien à redact » sur un document qu'on n'a pas fini de lire.
  if (count === 0)
    return partial
      ? {
          kind: "count",
          label: t.composer.detect.partialNone,
          partial: true,
          hint: t.composer.detect.partialNoneHint,
        }
      : { kind: "none" };
  return partial
    ? {
        kind: "count",
        label: t.composer.detect.partialCount(count),
        partial: true,
        hint: t.composer.detect.partialCountHint,
      }
    : { kind: "count", label: t.composer.modal.toMask(count) };
}

/**
 * The ONE keep toggle — every « garder en clair » gesture routes here (the mark's
 * inline menu, the chips row, the utility-risk pill), which is what makes the emission
 * below complete. Turning keep ON is the user telling the engine « tu as sur-détecté » :
 * the truest per-category FALSE-POSITIVE signal there is, so it is counted —
 * `redaction_kept`, CATEGORY only, never the value (the event union cannot even carry
 * it). Un-keeping (re-redact) is not a correction of the engine and stays silent.
 * A factory rather than a Composer closure so the rule is testable and the frozen
 * `Composer.tsx` stays a one-liner.
 */
export function makeToggleKeep(
  items: Item[],
  keepSet: ReadonlySet<string>,
  setKeepList: (fn: (prev: string[]) => string[]) => void,
): (value: string) => void {
  return (value) => {
    if (!keepSet.has(value)) {
      const kind = items.find((i) => i.value === value)?.kind;
      captureEvent({ name: "redaction_kept", kind: kind ?? "unknown" });
    }
    setKeepList((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };
}

/**
 * Les valeurs sensibles du PROMPT d'une compétence MISE EN SCÈNE — le brouillon reste
 * vide (la compétence est une entité, `ChatView` la stage), mais son prompt part dans
 * `modelText` et SERA redacted : sans cette source, le compteur sous-promettait —
 * « 1 à redact » annoncé quand 8 partaient masqués (constat 15/08, parcours G). Or
 * une compétence est précisément là où s'accumulent les coordonnées de cabinet qu'on
 * réutilise à chaque envoi sans les relire. Regex seule, synchrone — le prompt est
 * STATIQUE tant que la compétence est en scène, aucun debounce à payer.
 */
export function competencePromptCats(
  preview: string | undefined,
  disabledKinds?: readonly string[],
): Cat[] {
  return preview?.trim() ? detectRegex(preview, disabledKinds) : [];
}

/** Combien la compétence AJOUTE au compteur : ses valeurs distinctes, déduites de
 *  celles que le brouillon compte déjà (une même personne dans les deux ne fait pas
 *  deux). Les chips restent ceux du brouillon — une valeur du prompt ne s'y révèle
 *  pas, elle s'édite dans la compétence. */
export function competenceExtraCount(items: Item[], compCats: Cat[]): number {
  const counted = new Set(items.map((i) => i.value.toLowerCase()));
  const extra = new Set<string>();
  for (const c of compCats) {
    const v = c.value.toLowerCase();
    if (v && !counted.has(v)) extra.add(v);
  }
  return extra.size;
}
