import {
  BookIcon,
  GridIcon,
  MicIcon,
  ShieldIcon,
  CheckIcon,
  DownloadIcon,
  IconButton,
} from "../../components/brand";
import { extOf, fmtDate } from "./libraryKinds";
import { useFileThumb } from "./useFileThumb";
import { useInView } from "../../hooks/useInView";
import type { LibCardFile } from "./FileCard";

import { useT } from "../../i18n";
const KIND_ICON = { document: BookIcon, sheet: GridIcon, audio: MicIcon } as const;

/**
 * Le même fichier que `FileCard`, en RANGÉE.
 *
 * Deux composants et non un `mode` dans la carte : une carte et une rangée ne partagent
 * ni leur grille, ni ce qu'elles montrent (la rangée gagne la date et l'extension en
 * clair, elle perd la grande vignette). Un seul fichier avec deux branches se serait
 * transformé en deux composants mal séparés dans le même fichier.
 *
 * Ce qu'elles partagent RÉELLEMENT vit ailleurs, une seule fois : la forme des données
 * (`LibCardFile`), la vignette paresseuse (`useFileThumb` + `useInView` — une rangée hors
 * écran ne lit rien en base non plus) et le vocabulaire des catégories.
 */
export function FileRow({
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
  onDownload?: () => void;
}) {
  const t = useT();
  const isImage = file.kind === "image";
  const [markRef, inView] = useInView<HTMLSpanElement>();
  const thumb = useFileThumb(file.id, file.mime, isImage && inView);
  const Icon = KIND_ICON[file.kind as "document" | "sheet" | "audio"] ?? BookIcon;
  const shielded = file.redacted || !!file.redactedCount;
  const act = () => (selectMode ? onToggle() : onOpen());

  return (
    <div
      className={`om-row${selected ? " is-selected" : ""}`}
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
      <span ref={markRef} className="om-row-mark">
        {selectMode ? (
          <CheckIcon size={15} />
        ) : isImage && thumb ? (
          <img src={thumb} alt="" loading="lazy" decoding="async" />
        ) : (
          <Icon size={15} />
        )}
      </span>
      <span className="om-row-main">
        <span className="om-row-name">{file.name}</span>
        <span className="om-row-sub">{extOf(file.name)}</span>
      </span>
      <span className="om-row-meta">
        {/* The shield carries the COUNT when there is one: "protected" with no number doesn't
            say whether one value was masked or forty. An image or a PDF keeps
            `redacted:false` even though its text really was redacted — hence the count. */}
        {shielded && (
          <span
            className="om-row-shield"
            title={
              file.redactedCount
                ? `${file.redactedCount} valeur${file.redactedCount > 1 ? "s" : ""} redacted${file.redactedCount > 1 ? "s" : ""}`
                : "Fichier redacted"
            }
          >
            <ShieldIcon size={13} />
            {file.redactedCount ? ` ${file.redactedCount}` : ""}
          </span>
        )}
        {fmtDate(file.createdAt)}
      </span>
      <span
        className="om-row-actions"
        // The action must not OPEN the file along the way: the whole row is a
        // button, so any click inside it bubbles up to it.
        onClick={(e) => e.stopPropagation()}
      >
        {onDownload && !selectMode && (
          <IconButton size="sm" label={t.lists.library.openInApp} onClick={onDownload}>
            <DownloadIcon size={14} />
          </IconButton>
        )}
      </span>
    </div>
  );
}
