import { KeyIcon, XIcon } from "../../../../components/brand";
import { ModalTitle } from "../../../../containers/modals";
import { McpTile } from "../../../../components/media/McpTile";
import { authTagOf } from "../mcpAuth";
import type { McpItem } from "../mcpItems";

import { useT } from "../../../../i18n";
/**
 * The connector modal's head: the brand tile, the name as the kit's lime marker
 * title, its one-line description, the auth-model pill (how you connect it), and the
 * close tile. The panel's marker bar + open sweep come from ModalShell — not re-added
 * here.
 *
 * The close tile is the file viewer's `.fv-close` (its `-x` size), not a new control:
 * it is already the app's close affordance in two other modals. Escape and the scrim
 * closed this modal from the start, but neither is visible — a user who does not know
 * them has no way out of a dialog that fills the screen.
 */
export function McpModalHead({ item, onClose }: { item: McpItem; onClose: () => void }) {
  const t = useT();
  const tag = authTagOf(item, t);
  return (
    <div className="mcp-modal-head">
      <McpTile id={item.id} name={item.name} tone={item.tone} lg />
      <div className="flex-min">
        <ModalTitle>{item.name}</ModalTitle>
        <div className="mcp-modal-sub" title={item.desc}>
          {item.desc}
        </div>
      </div>
      <span className="mcp-auth-pill" title={tag.title}>
        <KeyIcon size={11} /> {tag.label}
      </span>
      <button
        type="button"
        className="fv-close fv-close-x"
        onClick={onClose}
        title={t.mcpTab.closeTip}
        aria-label={t.mcpTab.close}
      >
        <XIcon size={17} />
      </button>
    </div>
  );
}
