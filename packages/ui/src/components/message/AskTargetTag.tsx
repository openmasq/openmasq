import type { AskTarget } from "../../types";
import { FolderIcon, FileIcon } from "../brand";
import { askTargetLabel } from "../../send/askTarget";

/**
 * The « Demander » target tag on a SENT user bubble — WHAT the question was about (the
 * clicked folder/file, local or cloud). Like the compétence tag, the context line rode
 * the model payload rather than the message text, so this chip is its visible trace;
 * the title shows the exact snapshot that went out. Inert (no expansion): unlike a
 * compétence there is nothing to edit — the tag IS the whole content.
 */
export function AskTargetTag({ target }: { target: AskTarget }) {
  return (
    <div className="msg-tag msg-target" title={target.prompt ?? askTargetLabel(target)}>
      {target.kind === "folder" ? <FolderIcon size={12} /> : <FileIcon size={12} />}
      <span>{askTargetLabel(target)}</span>
    </div>
  );
}
