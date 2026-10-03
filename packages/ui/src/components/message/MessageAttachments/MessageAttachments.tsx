import { useT } from "../../../i18n";
import { MAX_FILE_CHARS } from "../../../send/foldPayload";
import { PaperclipIcon, ShieldIcon } from "../../brand";
import { useBubbleFold } from "../bubbleFold";
import { nameList } from "../nameList";
import { FileCard } from "./FileCard";
import { FILES_SUMMARY_AFTER, filesFoldKey, type FileEntry } from "./fileList";

/**
 * File CARDS under a message — user attachments AND files a tool/run_python returned,
 * stored in the local `files` table. Clicking one opens the document (a split file pane
 * when the surface has one, else the viewer modal — the parent's `onOpen` decides).
 *
 * Compact cards, two to a row. Past {@link FILES_SUMMARY_AFTER} files the list folds into
 * one « N fichiers » row that opens the grid and folds it back. Opening changes the row's
 * height without a list render: the windowed thread observes every row and re-measures.
 * A document the wire CUT says so, on its card and in one line under the list.
 */
export function MessageAttachments({
  attachments,
  onOpen,
  generated,
  owner,
}: {
  attachments?: FileEntry[];
  onOpen: (name: string) => void;
  /** Files PRODUCED for the user this turn (assistant side) — the kit's eyebrow. */
  generated?: boolean;
  /** The message id: the open state survives the row being scrolled out and back. */
  owner?: string;
}) {
  const t = useT();
  const files = attachments ?? [];
  const many = files.length > FILES_SUMMARY_AFTER;
  const { folded, toggle } = useBubbleFold(filesFoldKey(owner, files), many);
  if (!files.length) return null;
  const clipped = files.filter((f) => f.clipped).map((f) => f.name);
  return (
    <div className="msg-attachments">
      {folded ? (
        <button type="button" className="msg-file" aria-expanded="false" title={t.conversation.docs.showFiles} onClick={toggle}>
          <PaperclipIcon size={13} />
          <span className="msg-file-name">{t.conversation.docs.filesCount(files.length)}</span>
        </button>
      ) : (
        <div className="msg-files-grid">
          {files.map((f, i) => (
            <FileCard key={`${f.name}:${i}`} file={f} generated={generated} onOpen={onOpen} />
          ))}
        </div>
      )}
      {many && !folded && (
        <button type="button" className="link-btn msg-fold" aria-expanded="true" onClick={toggle}>
          {t.conversation.bubble.showLess}
        </button>
      )}
      {clipped.length > 0 && (
        <div className="shield-caption warn">
          <ShieldIcon size={12} />
          <span className="flex-min">
            {t.conversation.docs.clipped(nameList(clipped, t), MAX_FILE_CHARS.toLocaleString(t.common.intlTag))}
          </span>
        </div>
      )}
    </div>
  );
}
