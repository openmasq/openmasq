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

/** L'en-tête qui OUVRE chaque document plié dans le message user du wire — une seule
 *  source du format, lue aussi par `typedPartOfWire` (règle 9). */
const ATTACHMENT_HEADER_MARK = "=== Attached file: ";

/** La partie TAPÉE d'un message user du wire : tout ce qui précède le premier en-tête de
 *  pièce jointe. Ce qui lit « ce que l'utilisateur demande » (le rapprochement
 *  d'intégrations, la relance « connecteur nommé sans appel ») doit lire CETTE partie —
 *  jamais le message plié entier : « résume ce document » sur un courrier a proposé les
 *  cartes Square (un mot d'adresse du document) et Filesystem (le mot « filesystem »…
 *  de NOTRE propre `ATTACHMENT_INLINE_NOTE`, glissée sous chaque en-tête). */
export function typedPartOfWire(text: string): string {
  const i = text.indexOf(ATTACHMENT_HEADER_MARK);
  return i < 0 ? text : text.slice(0, i);
}

/** The per-document cap on what the WIRE carries (each folded file is clipped here,
 *  « …(truncated) » marker included) — THE single source (rule 9): the drop-time
 *  redaction scans to this bound and the preview modal shows the cut at it, so the
 *  three surfaces cannot disagree on where the document stops leaving the machine. */
export const MAX_FILE_CHARS = 50_000;

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
    t.length > maxFileChars ? t.slice(0, maxFileChars) + "\n…(truncated)" : t;
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
  // ⚠️ L'alias devient une ENTRÉE DE COFFRE (faux→réel), pour que la restitution le
  // retourne : la réponse du modèle cite « document-3.txt » — ou « Document-3 », la
  // tolérance de casse d'`unredact` s'en charge via le radical — et l'utilisateur doit
  // relire SON nom de fichier, pas un alias qui n'existe sur aucun disque (vécu 15/08 :
  // un inventaire de dossier entier désignait chaque pièce par un nom inconnaissable).
  // Conséquence règle 11, assumée : un argument d'outil nommant l'alias part désormais
  // avec le VRAI nom — c'est la doctrine (l'extérieur reçoit le réel), et la note
  // ci-dessus continue de dire au modèle de ne PAS aller chercher le fichier.
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

  // Les reps de réemploi d'abord : sur une collision (impossible en pratique, les alias
  // sont synthétiques), la carte du document gagne.
  return { modelText, fullModelText, hasFolded, reuseParts, vaultPreload: { ...aliasVault, ...vaultPreload } };
}
