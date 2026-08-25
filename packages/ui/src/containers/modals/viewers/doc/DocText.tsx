import { Fragment, type CSSProperties, type RefObject } from "react";
import { kindLabelFr } from "../../../../components/message/kindLabel";
import { docRevealSegments } from "./docReveal";
import type { PdfReplacement } from "../pdf/pdfReplacements";
import { splitMatches, type DocChunk, type SearchSeg } from "./docSearch";
import { useContainerWidth } from "../../../../hooks/useContainerWidth";
import { PAGE_BREAK, bodyCols, pageMetrics } from "./docFit";

/**
 * The ordered display chunks for a text tab — a single plain chunk for "Texte
 * extrait" / plain redacted, or per-segment chunks (with clickable reveal marks)
 * for the editable redacted view. Both the search counter (`useDocSearch`) and the
 * renderer ({@link DocText}) derive from these, so their match numbering agrees.
 * Pure.
 */
export function buildDocChunks(opts: {
  view: "extrait" | "redacted";
  text: string;
  replacements?: PdfReplacement[];
  revealed: ReadonlySet<string>;
  /** The redacted view is clickable (per-value reveal) only when editable. */
  editable: boolean;
  /** Deterministic redacted string when no clickable segments are shown. */
  redactedText: string | null;
}): DocChunk[] {
  const { view, text, replacements, revealed, editable, redactedText } = opts;
  if (view === "extrait") return [{ text }];
  if (editable && replacements?.length) {
    return docRevealSegments(text, replacements, revealed).map((s) =>
      s.real
        ? {
            text: s.text,
            mark: { real: s.real, tone: s.tone ?? "slate", kind: s.kind ?? "", revealed: !!s.revealed },
          }
        : { text: s.text },
    );
  }
  return [{ text: redactedText ?? "Redaction…" }];
}

/**
 * Split the display chunks into PER-PAGE groups on the extraction's page-break marker
 * (`\f`). A marked chunk (a reveal value) never spans a page break; a plain chunk is cut
 * at each `\f`. So a multi-page document renders one sheet per page. Pure.
 */
export function paginateChunks(chunks: DocChunk[]): DocChunk[][] {
  const pages: DocChunk[][] = [[]];
  for (const c of chunks) {
    if (c.mark || !c.text.includes(PAGE_BREAK)) {
      pages[pages.length - 1].push(c);
      continue;
    }
    const parts = c.text.split(PAGE_BREAK);
    parts.forEach((p, i) => {
      if (i > 0) pages.push([]);
      if (p) pages[pages.length - 1].push({ text: p });
    });
  }
  // Drop pages with no visible content (a `\f\f` / trailing break) so no blank sheet shows.
  const kept = pages.filter((pg) => pg.some((c) => c.text.trim().length > 0));
  return kept.length ? kept : [chunks];
}

/** Render one chunk's text as plain nodes + `<mark>`s on the search hits; the ACTIVE
 *  hit carries `activeRef` so the modal can scroll it into view. */
function renderSegs(segs: SearchSeg[], active: number, activeRef: RefObject<HTMLElement | null>) {
  return segs.map((s, k) =>
    s.hit === undefined ? (
      <Fragment key={k}>{s.text}</Fragment>
    ) : (
      <mark
        key={k}
        ref={s.hit === active ? (activeRef as RefObject<HTMLElement>) : undefined}
        className={`fv-search-hit${s.hit === active ? " active" : ""}`}
      >
        {s.text}
      </mark>
    ),
  );
}

/** Render one page's chunks into a `<pre>`, threading the running match index so the
 *  search numbering stays global across pages. Returns the nodes + the updated index. */
function renderPage(
  chunks: DocChunk[],
  query: string,
  startIndex: number,
  active: number,
  activeRef: RefObject<HTMLElement | null>,
  onToggleReveal?: (real: string) => void,
): { nodes: React.ReactNode[]; next: number } {
  let start = startIndex;
  const nodes = chunks.map((c, i) => {
    const { segs, next } = splitMatches(c.text, query, start);
    start = next;
    const inner = renderSegs(segs, active, activeRef);
    if (!c.mark) return <Fragment key={i}>{inner}</Fragment>;
    const m = c.mark;
    // Read-only view (no reveal wired). The « Texte » tab's real-showing marks carry a
    // `fake` — the REAL value is already on screen (rule 11), so exposing it as
    // `data-real` is no new leak, and `data-fake` feeds the hover popover that reveals
    // what the MODEL saw. The legacy static marks (no fake) stay attribute-free, so a
    // fake-showing mark never puts its real counterpart in the DOM.
    if (!onToggleReveal)
      return (
        <mark
          key={i}
          className={`redaction-mark hl-${m.tone}`}
          data-tone={m.tone}
          data-kind={m.kind}
          data-real={m.fake !== undefined ? m.real : undefined}
          data-fake={m.fake}
        >
          {inner}
        </mark>
      );
    // Pas d'onClick : inspecter ≠ révéler (audit 2026-08-10). Le clic (et Entrée — le
    // bouton est le chemin CLAVIER) ÉPINGLE la carte de révélation partagée
    // (`useMarkHover` délégué sur le conteneur) ; « Unredact » est l'action
    // explicite DE la carte, jamais le geste d'exploration lui-même.
    return (
      <button
        key={i}
        type="button"
        className={`redaction-mark hl-${m.tone} fv-reveal-mark${m.revealed ? " revealed" : ""}`}
        data-doc-reveal=""
        data-real={m.real}
        data-tone={m.tone}
        data-kind={m.kind}
        aria-label={`Valeur redacted${m.kind ? ` (${kindLabelFr(m.kind)})` : ""}${
          m.revealed ? " — gardée en clair" : ""
        } — inspecter`}
      >
        {inner}
      </button>
    );
  });
  return { nodes, next: start };
}

/**
 * The text body of the "Texte extrait" / "Redacted" tabs, rendered as DOCUMENT PAGES: a
 * grey "desk" holding one white PORTRAIT SHEET per document page (split on the extraction
 * page-break marker), each sized so the document's body width fills the sheet (see
 * `docFit.ts`) — so extracted text reads like a real document, not a code dump. Search
 * matches highlight across pages with a global match index; the clickable per-value
 * reveal marks (editable redacted view) work on any page.
 */
export function DocText({
  chunks,
  query,
  active,
  activeRef,
  onToggleReveal,
}: {
  chunks: DocChunk[];
  query: string;
  active: number;
  activeRef: RefObject<HTMLElement | null>;
  onToggleReveal?: (real: string) => void;
}) {
  const { ref, availWidth } = useContainerWidth();
  const fullText = chunks.map((c) => c.text).join("");
  const { pageWidth, fontSize, overflow } = pageMetrics(bodyCols(fullText), availWidth);
  const pages = paginateChunks(chunks);
  const pageStyle = {
    "--fv-page-w": `${pageWidth}px`,
    "--fv-fs": `${fontSize}px`,
  } as CSSProperties;
  let start = 0;
  return (
    <div className="fv-desk" ref={ref}>
      {pages.map((pg, pi) => {
        const { nodes, next } = renderPage(pg, query, start, active, activeRef, onToggleReveal);
        start = next;
        return (
          <div className="fv-page" style={pageStyle} key={pi}>
            {/* Too wide to fit at a readable size → don't WRAP (it breaks a layout grid);
                hold the floor font and let the sheet scroll horizontally (`fv-text-scroll`). */}
            <pre className={`fv-text${overflow ? " fv-text-scroll" : ""}`}>{nodes}</pre>
          </div>
        );
      })}
    </div>
  );
}
