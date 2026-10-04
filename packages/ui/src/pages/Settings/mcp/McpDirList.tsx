import { FolderIcon, XIcon } from "../../../components/brand";
import { baseName, displayParent } from "../../../state/files/localFsPaths";

import { useT } from "../../../i18n";

/**
 * A local connector's folders, as a LIST — one home for the connect form
 * (`McpLocalFields`) and the connected card (`McpGrantedDirs`), which used to render
 * the same markup twice.
 *
 * A row reads like the folder it is: its NAME first, where it lives underneath (home
 * shortened to `~`), the full path in the tooltip — never a 10px monospace path wrapped
 * mid-word. The remove control is a real icon button, keyboard-reachable.
 */
export function McpDirList({
  dirs,
  onRemove,
  removeDisabled,
  removeTitle,
}: {
  dirs: string[];
  onRemove: (dir: string) => void;
  removeDisabled?: boolean;
  /** Why removal is refused, when it is (e.g. the last required folder). */
  removeTitle?: string;
}) {
  const t = useT();
  if (!dirs.length) return null;
  return (
    <ul className="mcp-dir-list">
      {dirs.map((d) => (
        <li key={d} className="mcp-dir" title={d}>
          <span className="mcp-dir-ico" aria-hidden="true">
            <FolderIcon size={16} />
          </span>
          <span className="mcp-dir-text">
            <span className="mcp-dir-name">{baseName(d)}</span>
            <span className="mcp-dir-path">{displayParent(d)}</span>
          </span>
          <button
            type="button"
            className="icon-btn mcp-dir-x"
            onClick={() => onRemove(d)}
            disabled={removeDisabled}
            aria-label={t.mcpTab.removeDir(d)}
            title={removeTitle ?? t.mcpTab.remove}
          >
            <XIcon size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
