import { type ReactNode } from "react";
import type { PanelItem } from "../../../state/redux";
import { BottomSheet } from "../../../components/brand";

/**
 * Mobile presentation of THE side panel's document/artifact content (kit
 * `DocViewerSheet`): a phone has no room for a split pane, so the active
 * non-browser panel item renders inside a BottomSheet instead. The CONTENT is
 * the shell's `renderPanelContent` — the SAME viewers (PanelFileView with its
 * Redacted/Original toggle, ArtifactPanel) as desktop, so behaviour is
 * identical; only the chrome differs. Closing the sheet closes the panel item
 * (mobile has no persistent tab strip to park it on).
 */
export function MobileDocSheet({
  item,
  renderContent,
  onClose,
}: {
  /** The active non-browser panel item, or null → sheet closed. */
  item: PanelItem | null;
  renderContent: (item: PanelItem) => ReactNode;
  onClose: (id: string) => void;
}) {
  return (
    <BottomSheet
      open={!!item}
      onClose={() => item && onClose(item.id)}
      maxH="92dvh"
      label={item?.kind === "artifact" ? "Artefact" : "Document"}
    >
      {item && <div className="mobile-doc-sheet">{renderContent(item)}</div>}
    </BottomSheet>
  );
}
