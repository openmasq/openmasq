import { useMemo, useRef } from "react";
import { bytesToDataUrl } from "../../../components/media/MessageImage";
import { PdfRedactedViewer } from "./pdf/PdfRedactedViewer";
import { SpreadsheetViewer } from "../SpreadsheetViewer";
import { vaultReplacements } from "./pdf/pdfReplacements";
import { storedReplacements } from "./pdf/storedReplacements";
import { ImageRedacted } from "./ImageRedacted";
import { DocxViewer } from "./docx/DocxViewer";
import { PptxViewer } from "./pptx/PptxViewer";
import { FileSkeleton } from "./FileSkeleton";
import { DocText } from "./doc/DocText";
import { Markdown } from "../../../components/markdown/Markdown";
import { CSV, CSV_EXT, tileLabel, type FileViewerKind } from "./fileKind";
import { useDisplayReplacements } from "./doc/displayReplacements";

import { useT } from "../../../i18n";
export type LoadedFile = {
  name: string;
  mime: string;
  original: Uint8Array;
  scrubbed: Uint8Array | null;
  /** The persisted extraction (when the host stored it) — its `ocrPages` geometry
   *  is what lets a SCANNED PDF paint its redaction boxes post-send. */
  extraction?: {
    ocrPages?: import("@openmasq/redact/documents.browser").OcrLayerPage[];
    /** OCR word boxes (image scans) — ce qui permet de PEINDRE le redaction sur l'image. */
    words?: import("../../../host").ExtractedFile["words"];
    /** La carte de redaction du DÉPÔT, persistée avec le fichier — LA source des viewers
     *  (`storedReplacements`) ; le coffre de conversation n'est que le repli des vieilles
     *  lignes, et il sur-marque (il accumule toute la conversation). */
    redactions?: unknown;
  } | null;
};

/**
 * The Aperçu tab's CONTENT switch — one renderer per file kind, split out of
 * `FileViewerModal` (rule 1). Pure per-kind dispatch: byte choice (original vs
 * scrubbed), skeleton while loading, format fallback. The modal keeps the
 * chrome, tabs and the redacted toggle.
 */
export function FileViewerBody({
  data,
  kind,
  name,
  mime,
  showRedacted,
  vault,
  kinds,
  onOpenExternal,
}: {
  data: LoadedFile | null | "error";
  kind: FileViewerKind;
  name: string;
  mime: string;
  showRedacted: boolean;
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
  /** Present when the platform can hand the file to the OS (`host.db.openFile`). */
  onOpenExternal?: () => void;
}) {
  const t = useT();
  const textRef = useRef<HTMLElement>(null); // inert active-hit ref (search-less text page)
  // Images render as a plain <img> from a `data:` URL — the FULL native resolution,
  // crisp at any device-pixel-ratio.
  const imageSrc = useMemo(
    () =>
      kind === "image" && data && data !== "error"
        ? bytesToDataUrl(data.original, data.mime || mime)
        : null,
    [kind, data, mime],
  );
  // La carte du DÉPÔT stockée avec le fichier — prioritaire sur le coffre de la
  // conversation : même éléments et mêmes teintes que la modale post-dépôt (le coffre,
  // lui, accumule TOUTE la conversation et sur-marquait — constaté 14/08).
  const stored = useMemo(
    () => (data && data !== "error" ? storedReplacements(data.extraction?.redactions) : undefined),
    [data],
  );
  // Sheet redacted grid: replacements from the stored drop-time map (else the vault),
  // with the jetons display applied (fake → `[PERSON1]`) when the setting is on.
  // Computed unconditionally (hooks), used only by the sheet branch.
  const sheetReps = useDisplayReplacements(
    useMemo(
      () => (kind === "sheet" ? (stored ?? (vault ? vaultReplacements(vault, kinds) : undefined)) : undefined),
      [kind, stored, vault, kinds],
    ),
  );
  const imageReps = useDisplayReplacements(kind === "image" ? stored : undefined);
  if (data === null) {
    return <FileSkeleton variant={kind === "image" ? "image" : kind === "sheet" ? "sheet" : "doc"} />;
  }
  if (data === "error") return <div className="fv-status">{t.viewers.fileNotFound}</div>;
  if (kind === "image") {
    // Un scan redacted se montre REDACTED quand on a de quoi le peindre (boîtes OCR +
    // carte du dépôt) — l'original nu reste l'onglet Aperçu, et le repli si la peinture
    // échoue. Avant, la Bibliothèque montrait toujours l'original : zéro boîte.
    const words = data.extraction?.words;
    if (showRedacted && words?.length && imageReps?.length) {
      return <ImageRedacted bytes={data.original} mime={data.mime || mime} words={words} replacements={imageReps} />;
    }
    return <div className="fv-image">{imageSrc && <img src={imageSrc} alt="" />}</div>;
  }
  if (kind === "pdf")
    return (
      <PdfRedactedViewer
        bytes={data.original}
        redacted={showRedacted}
        ocrPages={data.extraction?.ocrPages}
        showTextHalo
        replacements={stored}
        vault={stored ? undefined : vault}
        kinds={stored ? undefined : kinds}
      />
    );
  const bytes = showRedacted && data.scrubbed ? data.scrubbed : data.original;
  if (kind === "markdown")
    return (
      <div className="fv-md">
        <Markdown content={new TextDecoder().decode(bytes)} />
      </div>
    );
  if (kind === "text") {
    // Render as document pages (no search / no reveal here → empty query, inert ref).
    return <DocText chunks={[{ text: new TextDecoder().decode(bytes) }]} query="" active={-1} activeRef={textRef} />;
  }
  if (kind === "sheet") {
    const isCsv = CSV.test(data.mime || mime) || CSV_EXT.test(name);
    // La bascule gouverne AUSSI la substitution du tableur : en vue « Original », la
    // grille montre les vraies valeurs (bytes originaux, zéro replacement).
    return <SpreadsheetViewer bytes={bytes} csv={isCsv} replacements={showRedacted ? sheetReps : undefined} />;
  }
  if (kind === "docx") return <DocxViewer bytes={bytes} />;
  if (kind === "pptx") return <PptxViewer bytes={bytes} />;
  return (
    <div className="fv-fallback">
      <div className="fv-fallback-badge">{tileLabel(kind, name)}</div>
      <p>{t.viewers.noPreviewForFormat}</p>
      {onOpenExternal && (
        <button className="btn-primary btn-inline" onClick={onOpenExternal}>
          {t.viewers.openFile}
        </button>
      )}
    </div>
  );
}
