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
            own sign: « … » forever made you wait for content that never comes
            (the reason, itself, shows at the bottom of the panel). */}
        {failed ? (
          <span className="rr-tree-failed" title={t.shell.folders.folderFailed}>
            !
          </span>
        ) : loading ? (
          <span className="rr-tree-loading">…</span>
        ) : null}
      </button>
      {isDir && onAsk && (
        <button
          type="button"
          className="rr-tree-ask"
          title={t.shell.folders.askAbout(entry.name)}
          aria-label={t.shell.folders.askAbout(entry.name)}
          onClick={() => onAsk(entry)}
        >
          <MessageIcon size={9} /> {t.shell.folders.ask}
        </button>
      )}
    </span>
  );
}
