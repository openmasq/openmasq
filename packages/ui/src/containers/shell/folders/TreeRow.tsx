import { ChevRightIcon, FolderIcon, MessageIcon } from "../../../components/brand";
import type { LocalFsEntry } from "../../../host";
import { extLabel } from "../../../state/files/localFsPaths";

import { useT } from "../../../i18n";
/** A tree row: a folder that expands, a file that opens. Hovering
 *  a folder offers « Demander » — the very intention for which this
 *  panel gets opened while writing. */
export function TreeRow({
  entry,
  depth,
  expanded,
  loading,
  failed,
  onToggle,
  onOpen,
  onAsk,
}: {
  entry: LocalFsEntry;
  depth: number;
  expanded: boolean;
  loading: boolean;
  /** Its read failed — the row SAYS so instead of loading indefinitely. */
  failed?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAsk?: (entry: LocalFsEntry) => void;
}) {
  const t = useT();
  const isDir = entry.kind === "dir";
  return (
    <span className="rr-tree-line">
      <button
        type="button"
        className={`rr-tree-row${isDir ? " is-dir" : ""}`}
        // The indentation is the only thing computed at runtime (it comes from the
        // depth, a piece of data); colours and states stay in the stylesheet.
        style={{ paddingInlineStart: `${6 + depth * 12}px` }}
        title={entry.path}
        aria-expanded={isDir ? expanded : undefined}
        onClick={isDir ? onToggle : onOpen}
      >
        <span className={`rr-tree-chev${expanded ? " open" : ""}`} aria-hidden="true">
          {isDir && <ChevRightIcon size={11} />}
        </span>
        {isDir ? (
          <span className="rr-tree-glyph" aria-hidden="true">
            <FolderIcon size={13} />
          </span>
        ) : (
          <span className="rr-tree-ext" aria-hidden="true">
            {extLabel(entry.name)}
          </span>
        )}
        <span className="rr-tree-name">{entry.name}</span>
        {/* An open folder whose listing isn't there looks like an empty folder —
            and an empty folder that isn't one reads like a lie. FAILURE has its
            own sign: « … » forever made you wait for content that never comes. */}
        {failed ? (
          <span className="rr-tree-failed" aria-hidden="true">
            !
          </span>
        ) : loading ? (
          <span className="rr-tree-loading">…</span>
        ) : null}
      </button>
      {isDir && onAsk && <AskButton name={entry.name} onAsk={() => onAsk(entry)} />}
      {failed && <FailedNote text={t.shell.folders.folderFailed} depth={depth} />}
    </span>
  );
}

/** « Demander » on a folder row — local root, local folder or remote entry: ONE button,
 *  revealed on hover AND on keyboard focus of its row (`.rr-tree-line:focus-within`). */
export function AskButton({ name, onAsk }: { name: string; onAsk: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className="rr-tree-ask"
      title={t.shell.folders.askAbout(name)}
      aria-label={t.shell.folders.askAbout(name)}
      onClick={onAsk}
    >
      <MessageIcon size={9} /> {t.shell.folders.ask}
    </button>
  );
}

/** A failed listing SAYS why, under its row — a reason kept in the « ! »'s tooltip was
 *  read by nobody, and by no screen reader. */
export function FailedNote({ text, depth = 0 }: { text: string; depth?: number }) {
  return (
    // The indentation follows the row's (runtime data, like TreeRow's own padding).
    <span className="rr-tree-note" role="note" style={{ paddingInlineStart: `${24 + depth * 12}px` }}>
      {text}
    </span>
  );
}
