import type { PanelItem } from "../../state/redux";
import { FileIcon, FolderIcon, GridIcon, PlusIcon, XIcon } from "../../components/brand";

import { useT } from "../../i18n";
/**
 * The side panel's DOCUMENT tabs — one horizontal tab per open file / artifact, at the
 * TOP of the panel and styled like the conversation tabs (reuses `.conv-tab*`). This is
 * the ONLY switcher for documents; the agent browser lives in the RightRail instead, so
 * a browser item NEVER appears here (the caller filters it out). « + » opens a library
 * file. Pure presentation — the open set lives in the `panel` slice.
 */
export function PanelTabs({
  items,
  activeId,
  onSelect,
  onClose,
  onOpenFile,
}: {
  /** Non-browser panel items only (files + artifacts). */
  items: PanelItem[];
  /** The on-screen document, or null when the browser holds the panel. */
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpenFile: () => void;
}) {
  const t = useT();
  const label = (i: PanelItem) =>
    i.kind === "artifact"
      ? i.artifact.title
      : i.kind === "file" || i.kind === "localfile"
        ? i.name
        : "";
  return (
    <div className="conv-tabs panel-tabs" role="tablist">
      <div className="conv-tabs-scroll">
        {items.map((i) => {
          const on = i.id === activeId;
          return (
            <div
              key={i.id}
              role="tab"
              aria-selected={on}
              className={`conv-tab conv-tab--${i.kind}${on ? " on" : ""}`}
              onClick={() => onSelect(i.id)}
              title={label(i)}
            >
              <span className="conv-tab-ico">
                {i.kind === "artifact" ? (
                  <GridIcon size={15} />
                ) : i.kind === "localfile" ? (
                  // A folder mark, so a tab makes clear the file lives on disk rather
                  // than in the Bibliothèque — the two behave differently on close.
                  <FolderIcon size={15} />
                ) : (
                  <FileIcon size={15} />
                )}
              </span>
              <span className="conv-tab-label">{label(i)}</span>
              <button
                className="conv-tab-x"
                aria-label={t.shell.panelTabs.closeTab}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(i.id);
                }}
              >
                <XIcon size={12} />
              </button>
            </div>
          );
        })}
        <button
          className="conv-tab-new"
          aria-label={t.shell.panelTabs.openFile}
          title={t.shell.panelTabs.openFileTip}
          onClick={onOpenFile}
        >
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  );
}
