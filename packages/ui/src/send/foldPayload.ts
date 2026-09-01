// Attachment → model-payload folding (pure, unit-tested). Extracted from
// `store.ts` `sendMessage`: it decides WHAT of the attached documents' text is
// folded into the wire the model sees, and HOW each file is named to the model.
// Security-relevant, so it's isolated + tested:
//   • `safeName` masks the REAL filename (refs/dates/names PII detection can't catch,
//     e.g. "438-GAZ-20220208.pdf") → the model only ever sees "document-N.<ext>".
//   • the folded-vs-image partition governs what leaves as TEXT (redacted via the
//     vault) vs what goes as redacted IMAGES (text kept OUT of this turn's wire).
//   • `vaultPreload` seeds the reused docs' drop-time fakes so `applyVault` and the
//     typed-text detector share the SAME fake for a value seen in both.
// The redaction itself happens in the caller (via the vault); this only STRUCTURES
// the payload — no PII decision lives here beyond the filename masking.

/** Model-facing note under EVERY attachment header. The masked name (`document-N.pdf`)
 *  IS a vault entry since 15/08 (alias → real name, see `header()` below) so the
 *  RESTITUTION works — an inventory answer used to display « Document-3 » to the user,
 *  a name that exists on no disk, the one substitution of the product that never came
 *  back. The note still matters: a small tool-happy model that sees a filename +
 *  a filesystem/drive tool goes fetching it and retry-loops on the miss; this
 *  note is what tells it the content is already inline. Asserted on the live wire by
 *  `apps/desktop/e2e/openai-redaction.e2e.ts` (imports this constant). */
export const ATTACHMENT_INLINE_NOTE =
  "[Contenu complet du fichier inclus ci-dessous. Ce nom est un alias : le fichier " +
  "n'existe sous ce nom sur aucun disque — ne tente JAMAIS de le lire via un outil " +
  "(filesystem, drive, etc.) ; réponds à partir du texte fourni.]";

/** The header that OPENS each folded document in the wire's user message — the single
 *  source of the format, also read by `typedPartOfWire` (rule 9). */
const ATTACHMENT_HEADER_MARK = "=== Attached file: ";

/** The TYPED part of a wire user message: everything before the first attachment
 *  header. Whatever reads « ce que l'utilisateur demande » (the integrations
 *  cross-reference, the « connecteur nommé sans appel » nudge) must read THIS part —
 *  never the whole folded message: « résume ce document » on a piece of mail surfaced the
 *  Square card (an address word from the document) and the Filesystem one (the word
 *  « filesystem »… from OUR OWN `ATTACHMENT_INLINE_NOTE`, slipped under every header). */
export function typedPartOfWire(text: string): string {
  const i = text.indexOf(ATTACHMENT_HEADER_MARK);
  return i < 0 ? text : text.slice(0, i);
}

/** The per-document cap on what the WIRE carries (each folded file is clipped here,
 *  « …(truncated) » marker included) — THE single source (rule 9): the drop-time
 *  redaction scans to this bound and the preview modal shows the cut at it, so the
 *  three surfaces cannot disagree on where the document stops leaving the machine. */
export const MAX_FILE_CHARS = 50_000;

/**
 * Clip `text` to at most `max` chars, cutting at the last LINE boundary within the
 * bound — never mid-line. A raw `slice(0, max)` routinely halved a value on the
 * boundary row (`jean.dup` out of an email, half an IBAN): the detector, scanning the
 * SAME clipped text, no longer recognises the fragment's shape, so the fragment
 * shipped in clear — a partially-redacted send. Cutting at the newline means every
 * line that leaves was scanned WHOLE. THE single clip (rule 9): the wire fold below,
 * the drop-time scan (`pages/ChatWorkspace/redactAttachment.ts`), the preview's
 * redacted bound (`AttachmentPreviewModal`), the detection layers and the tool-result
 * cap all call this — a second slice is how the surfaces drift. A text with no
 * newline inside the bound hard-cuts at `max` (nothing better exists for one line).
 */
export function clipFileText(text: string, max: number): string {
  if (text.length <= max) return text;
  const nl = text.lastIndexOf("\n", max);
  return text.slice(0, nl > 0 ? nl : max);
}

/** Only the fields the folding reads — decoupled from the full `ExtractedFile`. */
export interface FoldAttachment {
  name: string;
  text: string;
}

/** A drop-time document redaction pair (real→fake, with an optional tone). */
export interface DocReplacement {
  real: string;
  fake: string;
  tone?: string;
}

/** A reused document's wire part: its header + the drop-time reps + the clipped text. */
export interface ReusePart {
  header: string;
  reps: DocReplacement[];
  text: string;
}

export interface FoldedPayload {
  /** Typed text + the docs still to DETECT (or `resendWire` verbatim) → the engine input. */
  modelText: string;
  /** The FULL original payload (typed + EVERY folded doc, reused + detected + image) →
   *  persisted as `modelContent` so a later turn rebuilds the exact wire via the vault. */
  fullModelText: string;
  /** Did this send fold ANY document (or carry a `resendWire`)? Drives `modelContent` persist. */
  hasFolded: boolean;
  /** The reused docs' wire parts — the caller appends them via `applyVault` (never re-detected). */
  reuseParts: ReusePart[];
  /** fake→real entries to merge into the vault BEFORE detection, so a value seen in a
   *  reused doc AND the typed text gets ONE shared fake. */
  vaultPreload: Record<string, string>;
}

/** Fold the attached files' text into the model payload. See the module doc. */
export function buildFoldedPayload(
  text: string,
  attachments: FoldAttachment[] | undefined,
  opts: {
    imageNames?: string[];
    docReplacements?: Record<string, DocReplacement[]>;
    resendWire?: string;
  },
  /** Model-ONLY instruction prepended to the payload: the "Graphique" run_python
   *  directive, a compétence's prompt, or both. It is part of `modelText`, so the
   *  engine redacts it like any other text — never bypass this and append after. */
  prefix: string,
  maxFileChars = MAX_FILE_CHARS,
): FoldedPayload {
  const imageNames = new Set(opts.imageNames ?? []);
  const clip = (t: string) =>
    t.length > maxFileChars ? clipFileText(t, maxFileChars) + "\n…(truncated)" : t;
  // The real filename can itself leak (refs, dates, names PII detection won't catch,
  // e.g. "438-GAZ-20220208.pdf") — the model only ever sees a neutral name.
  const safeName = (name: string, i: number) => {
    const dot = name.lastIndexOf(".");
    return `document-${i + 1}${dot > 0 ? name.slice(dot) : ""}`;
  };
  // Text-fold attachments (NOT the ones sent as redacted images), in order.
  const folded = (attachments ?? []).filter((a) => a.text.trim() && !imageNames.has(a.name));
  // Docs sent as redacted IMAGES this turn: the model gets the IMAGES now (not their
  // text in the wire), but we STILL persist their extracted text into `modelContent` so
  // a FOLLOW-UP turn — and `run_python` (which can't read an image) — can access it.
  const imageDocs = (attachments ?? []).filter((a) => a.text.trim() && imageNames.has(a.name));

  // Partition the folded docs: reusable (drop-time redaction complete) vs to-detect.
  const reuseReps = opts.docReplacements ?? {};
  const detectDocs: { name: string; text: string }[] = [];
  const reuseDocs: { name: string; reps: DocReplacement[]; text: string }[] = [];
  for (const a of folded) {
    const reps = reuseReps[a.name];
    if (reps?.length) reuseDocs.push({ name: a.name, reps, text: clip(a.text) });
    else detectDocs.push({ name: a.name, text: clip(a.text) });
  }
  // Pre-load the reused replacements (fake→real) so the caller's vault + the typed-text
  // detector share the SAME fakes for a value seen in both.
  const vaultPreload: Record<string, string> = {};
  for (const d of reuseDocs) for (const r of d.reps) if (r.fake && r.real) vaultPreload[r.fake] = r.real;

  // Global doc numbering across ALL groups (detect → reuse → image) for coherent headers.
  // Every header carries `ATTACHMENT_INLINE_NOTE` (incl. the persisted image blocks — a
  // follow-up turn re-sends them and the model must not go fetch the alias then either).
  //
  // ⚠️ The alias becomes a VAULT ENTRY (fake→real), so restitution returns it: the
  // model's answer cites « document-3.txt » — or « Document-3 », the case tolerance of
  // `unredact` handles it via the stem — and the user must read back THEIR OWN filename,
  // not an alias that exists on no disk (lived 15/08: a whole folder inventory named
  // every item with an unrecognisable name).
  // Consequence of rule 11, accepted: a tool argument naming the alias now leaves
  // with the REAL name — that is the doctrine (the outside gets the real value), and the
  // note above still tells the model NOT to go fetch the file.
  let docNo = 0;
  const aliasVault: Record<string, string> = {};
  const header = (name: string, i: number) => {
    const alias = safeName(name, i);
    aliasVault[alias] = name;
    const stem = alias.replace(/\.[^.]+$/, "");
    const realStem = name.replace(/\.[^.]+$/, "");
    if (stem !== alias && realStem && realStem !== name) aliasVault[stem] = realStem;
    return `\n\n${ATTACHMENT_HEADER_MARK}${alias} ===\n${ATTACHMENT_INLINE_NOTE}\n`;
  };
  const detectBlocks = detectDocs.map((d) => `${header(d.name, docNo++)}${d.text}`).join("");
  const reuseParts: ReusePart[] = reuseDocs.map((d) => ({
    header: header(d.name, docNo++),
    reps: d.reps,
    text: d.text,
  }));
  // Image-sent docs' text — for `modelContent` persistence ONLY (numbered after the
  // folded ones so the headers stay coherent); NEVER added to `modelText`/the wire.
  const imageDocBlocks = imageDocs
    .map((d) => `${header(d.name, docNo++)}${clip(d.text)}`)
    .join("");

  // Only the typed text + the docs we must still detect go through the (costly) engine.
  // A RETRY (`resendWire`) re-sends the prior turn's `modelContent` VERBATIM.
  const modelText = opts.resendWire ?? (prefix + text + detectBlocks).trim();
  const fullModelText =
    opts.resendWire ??
    (
      prefix + text + detectBlocks + reuseParts.map((p) => p.header + p.text).join("") + imageDocBlocks
    ).trim();
  const hasFolded =
    !!opts.resendWire || detectDocs.length > 0 || reuseDocs.length > 0 || imageDocs.length > 0;

  // Reuse reps first: on a collision (impossible in practice, aliases are synthetic),
  // the document's map wins.
  return { modelText, fullModelText, hasFolded, reuseParts, vaultPreload: { ...aliasVault, ...vaultPreload } };
}
