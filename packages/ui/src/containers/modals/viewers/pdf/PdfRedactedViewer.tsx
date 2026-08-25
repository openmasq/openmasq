import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  renderRedactedPdf,
  pdfReplacements,
  vaultReplacements,
  attachWordPicker,
  type PdfReplacement,
} from "@openmasq/redact/pdf-redact";
import { useDisplayReplacements } from "../doc/displayReplacements";
import {
  useRedaction,
  describeRedactFailure,
  useRedactEngine,
} from "../../../../send/redaction";
import { FileSkeleton } from "../FileSkeleton";
import { buildImageZoneLayer, buildRevealMarks, buildTextHaloLayer, imageSourceNote } from "./pageLayers";

/**
 * PDF preview: thin React shell over the SHARED `renderRedactedPdf`
 * (@openmasq/redact/pdf-redact) — the same pixel-paint core the extension reuses,
 * so the redaction-render logic lives in ONE place. This wrapper just appends
 * each returned canvas + builds the hover-to-reveal layer from the boxes.
 * VIEWER-ONLY: input bytes are read once, never modified/persisted.
 */
export function PdfRedactedViewer({
  bytes,
  redacted = true,
  replacements,
  ocrPages,
  showTextHalo,
  vault,
  kinds,
  revealed,
  onReveal,
  onWordPick,
}: {
  bytes: Uint8Array;
  /** false → render the ORIGINAL document as-is (no fakes, no highlights). */
  redacted?: boolean;
  /** Pre-computed real→fake map (from attach). When set, no model call here. */
  replacements?: PdfReplacement[];
  /** Per-page OCR word geometry from the extraction (`ExtractedFile.ocrPages`) —
   *  the SCANNED-page fallback: without it a scan renders with ZERO redaction
   *  boxes (no pdf.js text layer to correlate on) even though OCR succeeded. */
  ocrPages?: import("@openmasq/redact/pdf-redact").RenderRedactedPdfOptions["ocrPages"];
  /** Halo léger sur les zones où du TEXTE a été lu (couche texte + mots OCR) — ce qui,
   *  redacted, part vers le modèle ; le reste de la page n'a pas été lu. Active la
   *  collecte des mots du peintre (un `measureText` par mot). */
  showTextHalo?: boolean;
  /** Conversation vault (fake→original) of an already-sent file. When set (and no
   *  explicit `replacements`), the redacted overlay is rebuilt from it — EXACTLY
   *  the fakes that were sent, instantly, with no model call (so opening the file
   *  never re-runs — and can't degrade — the redaction). See `vaultReplacements`. */
  vault?: Record<string, string>;
  /** Conversation kinds (original→category) for the vault path's tones. */
  kinds?: Record<string, string>;
  /** REAL values the user revealed (kept in clear). Painted with clean glyphs;
   *  re-renders when it changes. Absent ⇒ everything redacted. */
  revealed?: ReadonlySet<string>;
  /** Click a redacted region → toggle its real value in/out of the reveal set.
   *  When set, each region is a clickable "reveal / re-redact" button. */
  onReveal?: (real: string) => void;
  /** Click a WORD of the canvas (outside the redacted marks) → the consumer opens
   *  its «Redact “mot”» type picker anchored at the viewport coords. Enables the
   *  painter's word-geometry collection (text layer + OCR words of a scan). The
   *  clicked word keeps a LOCKED pre-highlight until the consumer calls `release`
   *  (menu closed or type picked). */
  onWordPick?: (value: string, x: number, y: number, release: () => void) => void;
}) {
  const redact = useRedaction();
  // Keep `onReveal` in a ref so a fresh function identity each render doesn't
  // re-trigger the (heavy) full re-render — only a `revealed` change should.
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const onWordPickRef = useRef(onWordPick);
  onWordPickRef.current = onWordPick;
  // Le halo consomme la même collecte de mots que le picker « Redact “mot” ».
  const wantWords = !!onWordPick || !!showTextHalo;
  // Incremental reveal: the heavy render runs ONCE (per document/replacements);
  // a reveal toggle only calls each page's `applyReveal` + rebuilds its marks —
  // no pdf.js reload, no skeleton, no scroll reset. `revealed` therefore rides a
  // ref for the initial paint and is NOT a dependency of the heavy effect.
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const pagesRef = useRef<
    { pg: import("@openmasq/redact/pdf-redact").RenderedPage; pageEl: HTMLElement }[]
  >([]);
  // Prefer explicit replacements; else derive them from the conversation vault
  // (deterministic, matches the wire). Only fall back to a live model call when
  // neither exists (e.g. the Library viewer, with no conversation context).
  const resolvedReplacements = useMemo<PdfReplacement[] | undefined>(() => {
    if (replacements) return replacements;
    if (vault && Object.keys(vault).length) return vaultReplacements(vault, kinds);
    return undefined;
  }, [replacements, vault, kinds]);
  // Jetons display: the painted boxes show `[PERSON1]` instead of the fake when the
  // setting is on. Idempotent over an already-substituted caller list (the tokens are
  // recomputed from real+kind), so every entry path lands on the same rendering.
  const effectiveReplacements = useDisplayReplacements(resolvedReplacements);
  const engine = useRedactEngine();
  const rootRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Zero pages rendered (all past the cap, or an empty doc that still resolved):
  // without this flag the ready state shows a BLANK white area, not even a status.
  const [empty, setEmpty] = useState(false);
  const [truncated, setTruncated] = useState(0);
  const [warn, setWarn] = useState<string | null>(null);
  // What was marked as coming from the IMAGE — drives the legend. Counted from the
  // pages themselves, so the note never explains a code nothing on screen wears.
  const [imgSrc, setImgSrc] = useState({ zones: 0, pages: 0 });
  // Loupe: page width = FIT-to-panel width × zoom (1 = adjusted to the panel).
  // CSS-only (a custom property) so changing it never re-runs the heavy render.
  const [zoom, setZoom] = useState(1);

  /** The marks layer, always through the ref: a fresh `onReveal` identity each render
   *  must not re-trigger the heavy effect (see `onRevealRef`). */
  const buildMarks = (
    pageEl: HTMLElement,
    boxes: import("@openmasq/redact/pdf-redact").RedactBox[],
    cssW: number,
    cssH: number,
  ) => buildRevealMarks(pageEl, boxes, cssW, cssH, !!onRevealRef.current);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ctrl = new AbortController();
    root.innerHTML = "";
    pagesRef.current = [];
    setState("loading");
    setEmpty(false);
    setTruncated(0);
    setWarn(null);
    setImgSrc({ zones: 0, pages: 0 });

    (async () => {
      try {
        const { pages, modelError, truncated } = await renderRedactedPdf({
          bytes,
          redacted,
          replacements: effectiveReplacements,
          ocrPages,
          collectWords: wantWords,
          reveal: revealedRef.current,
          pdfWorkerSrc: workerUrl,
          getReplacements: (t) => pdfReplacements(t, redact),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        if (modelError) setWarn(describeRedactFailure(modelError, engine));
        setTruncated(truncated);

        const imgTally = { zones: 0, pages: 0 };
        let pageIndex = 0;
        for (const pg of pages) {
          const pageEl = document.createElement("div");
          pageEl.className = "pdfv-page";
          // Make the canvas RESPONSIVE here (the shared painter ships it at fixed
          // natural px — the extension needs that for its px overlay): the max-width
          // cap beats the painter's inline width, so a WIDE/landscape page scales
          // DOWN to fit the panel instead of being clipped, and `height:auto` keeps
          // the intrinsic ratio. The page's NATURAL CSS width rides a custom
          // property: the fit rule caps a narrow page at true size (no upscale
          // blur), and the zoom rule multiplies the FIT width by `--pdf-zoom` (see
          // styles.css `.pdfv-page`). The box coords below are CSS px in that same
          // natural space — the painter's own `cssW`/`cssH`, never re-parsed from
          // the (now overridden) inline styles.
          pg.canvas.style.maxWidth = "100%";
          pg.canvas.style.height = "auto";
          const cssW = pg.cssW || pg.canvas.width || 1;
          const cssH = pg.cssH || pg.canvas.height || 1;
          // Runtime-computed per-page width — the sanctioned inline-style case.
          pageEl.style.setProperty("--page-nat", String(cssW));
          pageEl.appendChild(pg.canvas);
          if (pg.words.length) {
            // Word-processor-style interaction over the canvas: hover pre-highlight,
            // click = one word, DRAG = a contiguous run of words; the picked run
            // stays locked until the «Redact» menu releases it. Shared core
            // (`attachWordPicker`) — same behaviour as the scanned-image view.
            attachWordPicker({
              container: pageEl,
              canvas: pg.canvas,
              words: pg.words,
              space: { w: cssW, h: cssH },
              ignore: ".pdfv-mark",
              onPick: (value, x, y, release) => onWordPickRef.current?.(value, x, y, release),
            });
          }
          // Halo d'abord (le contexte le plus bas), puis zones, puis marques.
          // Légende sur la PREMIÈRE page seulement — une par page serait du bruit.
          // `wireWords`, jamais `words` : un mot pris dans l'image (logo, tampon) est lu
          // et encadré, mais son texte ne part pas — un halo dessus contredirait le cadre.
          if (showTextHalo && pg.wireWords.length) buildTextHaloLayer(pageEl, pg.wireWords, cssW, cssH, pageIndex === 0);
          // Before the marks, so a redaction box always paints OVER a zone outline.
          const marked = buildImageZoneLayer(pageEl, pg, cssW, cssH);
          imgTally.zones += marked.zones;
          imgTally.pages += marked.imageOnly ? 1 : 0;
          buildMarks(pageEl, pg.boxes, cssW, cssH);
          pageIndex++;
          root.appendChild(pageEl);
          pagesRef.current.push({ pg, pageEl });
        }
        setImgSrc(imgTally);
        setEmpty(pages.length === 0);
        setState("ready");
      } catch {
        if (!ctrl.signal.aborted) setState("error");
      }
    })();

    return () => ctrl.abort();
  }, [bytes, redact, redacted, effectiveReplacements, ocrPages, wantWords, showTextHalo, engine]);

  // Reveal toggle: INCREMENTAL — restore/repaint just the affected patches on the
  // already-rendered canvases and rebuild each page's marks. No reload.
  useEffect(() => {
    for (const { pg, pageEl } of pagesRef.current) {
      const boxes = pg.applyReveal(revealed);
      buildMarks(pageEl, boxes, pg.cssW || pg.canvas.width || 1, pg.cssH || pg.canvas.height || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  return (
    <div className="pdfv">
      {warn && (
        <div className="pdfv-warn">
          {/* No settings shortcut: the engine is always the on-device NER, which the
              user cannot reconfigure, so the failure is stated and nothing is promised. */}
          <span className="flex-min">{warn}</span>
        </div>
      )}
      {state === "ready" && imageSourceNote(imgSrc.zones, imgSrc.pages) && (
        <div className="pdfv-imgnote" role="note">
          <span className="pdfv-imgnote-key" aria-hidden="true" />
          <span className="flex-min">{imageSourceNote(imgSrc.zones, imgSrc.pages)}</span>
        </div>
      )}
      {state === "loading" && (
        <div className="pdfv-loading">
          {/* The kit's ONE loading visual: the content-shaped shimmer, same as every
              other stage of the file path (meta resolve, byte load, Texte extraction).
              No status row / progress bar / Annuler — closing the panel aborts. */}
          <FileSkeleton variant="doc" />
        </div>
      )}
      {state === "error" && (
        <div className="fv-status">Aperçu PDF indisponible (utilisez « Ouvrir »).</div>
      )}
      {state === "ready" && empty && (
        <div className="fv-status">Aucune page à afficher.</div>
      )}
      {state === "ready" && !empty && (
        <div className="pdfv-zoom" role="group" aria-label="Zoom du document">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z / 1.25) * 100) / 100))}
            aria-label="Dézoomer"
            title="Dézoomer"
          >
            −
          </button>
          <button
            type="button"
            className="pdfv-zoom-fit"
            onClick={() => setZoom(1)}
            title="Ajuster à la largeur du panneau"
          >
            {Math.round(zoom * 100)} %
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Math.round(z * 1.25 * 100) / 100))}
            aria-label="Zoomer"
            title="Zoomer"
          >
            +
          </button>
        </div>
      )}
      <div
        ref={rootRef}
        className={`pdfv-pages${zoom !== 1 ? " zoomed" : ""}`}
        // Runtime-computed zoom factor — the sanctioned inline-style case.
        style={{ "--pdf-zoom": zoom } as CSSProperties}
      />
      {truncated > 0 && <div className="pdfv-note">+{truncated} page(s) non affichée(s)</div>}
    </div>
  );
}
