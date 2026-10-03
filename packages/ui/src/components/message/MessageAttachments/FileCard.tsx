import { BRAND } from "@openmasq/branding";
import { useT } from "../../../i18n";
import { DownloadIcon, ShieldIcon } from "../../brand";
import { fileExt, type FileEntry } from "./fileList";

/**
 * ONE compact file card (kit `MessageFileCard`): the EXTENSION in mono, the name, the shield.
 * The card leads with the format, not a drawn thumbnail: it never rendered the real file,
 * and it wore an `--hl-*` tint (the mask's language) on a card that masks nothing. The
 * shield carries the REAL count when known and stays count-less otherwise — never invented.
 */
export function FileCard({ file, generated, onOpen }: { file: FileEntry; generated?: boolean; onOpen: (name: string) => void }) {
  const t = useT();
  const ext = fileExt(file);
  return (
    <button type="button" className="msg-filecard" title={t.conversation.bubble.openAttachment(file.name)} onClick={() => onOpen(file.name)}>
      <span className={`msg-filecard-ext${ext.length > 3 ? " long" : ""}`} aria-hidden="true">
        {ext}
      </span>
      <span className="msg-filecard-body">
        {generated && <span className="msg-filecard-eyebrow">{t.conversation.docs.generatedBy(BRAND.name)}</span>}
        <span className="msg-filecard-name">{file.name}</span>
        <span className="msg-filecard-meta">
          <span className="msg-filecard-shield">
            <ShieldIcon size={10} />
            {typeof file.redactions === "number" && file.redactions > 0 ? file.redactions : null}
          </span>
          {file.clipped && <span className="msg-file-cut">{t.conversation.docs.clippedTag}</span>}
        </span>
      </span>
      <span className="msg-filecard-open" aria-hidden="true">
        <DownloadIcon size={14} />
      </span>
    </button>
  );
}
