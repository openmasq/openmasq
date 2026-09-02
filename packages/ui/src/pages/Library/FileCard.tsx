import {
  BookIcon,
  GridIcon,
  MicIcon,
  ShieldIcon,
  CheckIcon,
  DownloadIcon,
  IconButton,
} from "../../components/brand";
import { extOf, fmtDate, type LibKind } from "./libraryKinds";
import { useFileThumb } from "./useFileThumb";
import { useInView } from "../../hooks/useInView";

import { useT } from "../../i18n";
/** The card shape LibraryView feeds in (a stored file + its resolved category). */
export interface LibCardFile {
  id: string;
  name: string;
  mime: string;
  createdAt: number;
  redacted: boolean;
  /** Distinct masked values in the file — shown next to the shield when > 0. */
  redactedCount?: number;
  kind: LibKind;
}

const KIND_ICON = { document: BookIcon, sheet: GridIcon, audio: MicIcon } as const;

/**
 * One library file as a design-system card: a thumbnail region (the REAL image for
 * image files, else a category icon on a per-extension tint) with an EXT chip +
 * a shield badge when redacted, over a footer (name + date). Click opens the viewer;
 * in select mode it ticks instead. Pure presentation — no DB writes here.
 */
export function FileCard({
  file,
  selectMode,
  selected,
  onOpen,
  onToggle,
  onDownload,
}: {
  file: LibCardFile;
  selectMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  /** Kit footer action: hand the file to the OS (open externally / download). */
  onDownload?: () => void;
}) {
  const t = useT();
  const isImage = file.kind === "image";
  // Only load an image's bytes once its card nears the viewport (lazy, like the chat) —
  // an off-screen library image is never read from the DB nor decoded.
  const [thumbRef, inView] = useInView<HTMLDivElement>();
  const thumb = useFileThumb(file.id, file.mime, isImage && inView);
  const ext = extOf(file.name);
  const Icon = KIND_ICON[file.kind as "document" | "sheet" | "audio"] ?? BookIcon;
  const act = () => (selectMode ? onToggle() : onOpen());

  return (
    <div
      className={`file-card${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      title={selectMode ? t.lists.library.selectFile : t.lists.library.openFile}
      onClick={act}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          act();
        }
      }}
    >
      <div
        ref={thumbRef}
        className={`file-card-thumb kind-${file.kind}`}
        // Per-file tint from data → the allowed runtime inline-style case.
      >
        {isImage ? (
          thumb ? (
            // Shown as soon as it decodes. It used to blur-and-scale in, which on a grid
            // of thumbnails is a dozen simultaneous animations for a picture that is
            // already there — the reveal drew more attention than the content.
            <img src={thumb} alt="" loading="lazy" decoding="async" className="file-card-img" />
          ) : (
            <span className="file-card-img-skeleton" aria-hidden="true" />
          )
        ) : (
          <span className="file-card-glyph">
            <Icon size={30} />
          </span>
        )}
        {!isImage && <span className="file-card-ext">{ext}</span>}
        {/* An image/PDF can't have its BYTES scrubbed (redacted stays false) yet still had
            its OCR/text redacted — so the shield keys off the count too, not `redacted` alone. */}
        {(file.redacted || !!file.redactedCount) && (
          <span
            className="file-card-shield"
            title={
              file.redactedCount
                ? t.lists.library.redactedCountTip(file.redactedCount)
                : t.lists.library.redactedTip
            }
          >
            <ShieldIcon size={11} />
            {!!file.redactedCount && <span className="file-card-shield-n">{file.redactedCount}</span>}
          </span>
        )}
        {selectMode && (
          <span className={`file-card-check${selected ? " is-checked" : ""}`} aria-hidden="true">
            {selected && <CheckIcon size={12} />}
          </span>
        )}
      </div>
      <div className="file-card-foot">
        <div className="file-card-foot-main">
          <div className="file-card-name">{file.name}</div>
          <div className="file-card-date">{fmtDate(file.createdAt)}</div>
        </div>
        {/* ONE icon action on the footer's right — the external app. The card itself
            already opens the preview, so a second « Aperçu » button only repeated the
            click target. The span swallows the click so it doesn't ALSO open the panel. */}
        {!selectMode && onDownload && (
          <span className="file-card-foot-actions" onClick={(e) => e.stopPropagation()}>
            <IconButton size="sm" label={t.lists.library.openExternal} onClick={onDownload}>
              <DownloadIcon size={15} />
            </IconButton>
          </span>
        )}
      </div>
    </div>
  );
}
