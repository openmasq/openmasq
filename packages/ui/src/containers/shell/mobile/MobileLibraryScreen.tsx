import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useHost } from "../../../host";
import { panelCloseItem, panelOpenFile, useAppDispatch } from "../../../state/redux";
import type { Conversation } from "../../../types";
import {
  BookIcon,
  BottomSheet,
  DotsIcon,
  DownloadIcon,
  EyeIcon,
  GridIcon,
  MicIcon,
  ShieldIcon,
  TrashIcon,
} from "../../../components/brand";
import { ConfirmDialog } from "../../../components/feedback/ConfirmDialog";
import { useInView } from "../../../hooks/useInView";
import { useLibraryFiles } from "../../../pages/Library";
import type { LibFile } from "../../../pages/Library";
import { useFileThumb } from "../../../pages/Library/useFileThumb";
import { fileMetaLine, splitBySegment, type MobileLibSegment } from "./libraryScreenModel";

import { useT } from "../../../i18n";
const KIND_ICON = { document: BookIcon, sheet: GridIcon, audio: MicIcon } as const;

/**
 * The mobile Bibliothèque (kit `chat-app-mobile` Library) — the FIRST screen ported off
 * the desktop layout. Same listing as the desktop grid (`useLibraryFiles`, rule 9: one
 * source), recomposed for a thumb: a display title, two segments, files as a scannable
 * LIST and images as a 3-column grid, and per-file actions in a bottom sheet instead of
 * a hover row.
 *
 * Tapping a file opens it in THE shared panel (`panelOpenFile`) — which the mobile shell
 * presents as the document sheet, so the viewers, the Redacted/Original toggle and the
 * vault-driven masking are the desktop's, unchanged.
 *
 * ⚠️ **No "Renommer".** The kit's action sheet offers it, but `host.db` has no rename —
 * an item that silently does nothing is worse than an absent one. Add the row when the
 * capability lands, not before. Same rule for Télécharger / Supprimer: each is rendered
 * ONLY when its host slot exists (`openFile` / `deleteFile`), so the sheet never
 * promises something this platform cannot do.
 */
export function MobileLibraryScreen({ conversations }: { conversations: Conversation[] }) {
  const t = useT();
  const host = useHost();
  const dispatch = useAppDispatch();
  const { files, setFiles } = useLibraryFiles(conversations);
  const [segment, setSegment] = useState<MobileLibSegment>("files");
  const [menuFile, setMenuFile] = useState<LibFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LibFile | null>(null);

  const buckets = useMemo(() => splitBySegment(files ?? []), [files]);
  const visible = buckets[segment];

  const open = (f: LibFile) => {
    setMenuFile(null);
    dispatch(panelOpenFile({ id: f.id, name: f.name, mime: f.mime, convId: f.conversationId }));
  };
  const remove = async (f: LibFile) => {
    setConfirmDelete(null);
    setMenuFile(null);
    dispatch(panelCloseItem(f.id));
    setFiles((prev) => (prev ? prev.filter((x) => x.id !== f.id) : prev));
    await host.db?.deleteFile?.(f.id)?.catch(() => {});
  };

  return (
    <div className="mobile-screen mlib">
      <header className="mlib-head">
        <h1 className="mlib-title">{t.sections.library.label}</h1>
        <div className="mobile-seg" role="tablist" aria-label={t.shell.mobile.library.filesOrImages}>
          {(
            [
              ["files", t.shell.mobile.library.files],
              ["images", t.shell.mobile.library.images],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={segment === id}
              className={`mobile-seg-btn${segment === id ? " on" : ""}`}
              onClick={() => setSegment(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mlib-body">
        {files === null ? (
          <p className="mlib-empty">{t.common.loading}</p>
        ) : visible.length === 0 ? (
          <p className="mlib-empty">
            {segment === "images" ? t.shell.mobile.library.noImages : t.shell.mobile.library.noFiles}
            <span className="mlib-empty-sub">
              {t.shell.mobile.library.emptySub}
            </span>
          </p>
        ) : segment === "images" ? (
          <div className="mlib-grid">
            {visible.map((f) => (
              <ImageTile key={f.id} file={f} onOpen={() => open(f)} />
            ))}
          </div>
        ) : (
          <ul className="mlib-list">
            {visible.map((f) => (
              <FileRow key={f.id} file={f} onOpen={() => open(f)} onMenu={() => setMenuFile(f)} />
            ))}
          </ul>
        )}
      </div>

      <BottomSheet
        open={!!menuFile}
        onClose={() => setMenuFile(null)}
        maxH="auto"
        label={t.shell.mobile.library.fileActions}
      >
        {menuFile && (
          <div className="mlib-actions">
            <div className="mlib-actions-name">{menuFile.name}</div>
            <button type="button" className="mlib-action" onClick={() => open(menuFile)}>
              <EyeIcon size={18} /> Ouvrir
            </button>
            {host.db?.openFile && (
              <button
                type="button"
                className="mlib-action"
                onClick={() => {
                  void host.db?.openFile?.(menuFile.id);
                  setMenuFile(null);
                }}
              >
                <DownloadIcon size={18} /> Ouvrir dans l'app externe
              </button>
            )}
            {host.db?.deleteFile && (
              <button
                type="button"
                className="mlib-action danger"
                onClick={() => setConfirmDelete(menuFile)}
              >
                <TrashIcon size={18} /> Supprimer
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            title={t.shell.mobile.library.deleteTitle}
            message={t.shell.mobile.library.deleteBody(confirmDelete.name)}
            confirmLabel={t.common.delete}
            cancelLabel={t.common.cancel}
            onConfirm={() => void remove(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** One file as a list row: tinted kind tile, name, "PDF · date", shield, ⋯. */
function FileRow({
  file,
  onOpen,
  onMenu,
}: {
  file: LibFile;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const t = useT();
  const Icon = KIND_ICON[file.kind as "document" | "sheet" | "audio"] ?? BookIcon;
  const meta = fileMetaLine(file);
  return (
    <li className="mlib-row">
      <button type="button" className="mlib-row-main" onClick={onOpen}>
        {/* Neutral, like the desktop card: the tint by extension was removed
            (`libraryKinds.ts` says why). Nothing inline here anymore. */}
        <span className="mlib-row-tile">
          <Icon size={18} />
        </span>
        <span className="mlib-row-text">
          <span className="mlib-row-name">{file.name}</span>
          {meta && <span className="mlib-row-meta">{meta}</span>}
        </span>
        {(file.redacted || !!file.redactedCount) && (
          <span
            className="mlib-row-shield"
            title={
              file.redactedCount
                ? t.shell.mobile.library.redactedData(file.redactedCount)
                : t.shell.mobile.library.hasRedacted
            }
          >
            <ShieldIcon size={12} />
            {!!file.redactedCount && <span className="mlib-row-shield-n">{file.redactedCount}</span>}
          </span>
        )}
      </button>
      <button type="button" className="mlib-row-menu" onClick={onMenu} aria-label={t.shell.mobile.library.rowActions(file.name)}>
        <DotsIcon size={18} />
      </button>
    </li>
  );
}

/** One image as a square grid tile — the REAL preview (the model only saw a fake). */
function ImageTile({ file, onOpen }: { file: LibFile; onOpen: () => void }) {
  const [ref, inView] = useInView<HTMLButtonElement>();
  const thumb = useFileThumb(file.id, file.mime, inView);
  return (
    <button ref={ref} type="button" className="mlib-tile" onClick={onOpen} aria-label={file.name}>
      {thumb ? (
        <img src={thumb} alt="" loading="lazy" decoding="async" className="mlib-tile-img" />
      ) : (
        <span className="mlib-tile-skeleton" aria-hidden="true" />
      )}
      {(file.redacted || !!file.redactedCount) && (
        <span className="mlib-tile-shield" aria-hidden="true">
          <ShieldIcon size={11} />
        </span>
      )}
    </button>
  );
}
