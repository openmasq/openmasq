import { DownloadIcon, ShieldIcon } from "../brand";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../i18n";
/**
 * File CARDS under a message (kit `MessageFileCard`) — user attachments AND files a
 * tool/run_python returned, stored in the local `files` table. Clicking one opens the
 * document (a split file pane when the surface has one, else the viewer modal — the
 * parent's `onOpen` decides).
 *
 * The card leads with its EXTENSION in mono, not with a picture. What sat there before
 * was a drawn "redacted document" in one of five rotating highlight tints — a thumbnail
 * of nothing (it never rendered the real file) wearing the palette that means "this value
 * was masked". Reading the format is the thing a file card owes you; the shield badge
 * carries the REAL redaction count when known, and stays count-less otherwise — never an
 * invented number.
 */
export function MessageAttachments({
  attachments,
  onOpen,
  generated,
}: {
  attachments?: { name: string; kind: string; mime?: string; redactions?: number }[];
  onOpen: (name: string) => void;
  /** Files PRODUCED for the user this turn (assistant side) — the kit's eyebrow. */
  generated?: boolean;
}) {
  const t = useT();
  if (!attachments?.length) return null;
  return (
    <div className="msg-attachments">
      {attachments.map((a, i) => {
        const ext = (a.name.split(".").pop() || a.kind).toUpperCase().slice(0, 4);
        return (
          <button className="msg-filecard" key={i} title={t.conversation.bubble.openAttachment(a.name)} onClick={() => onOpen(a.name)}>
            <span className={`msg-filecard-ext${ext.length > 3 ? " long" : ""}`} aria-hidden="true">
              {ext}
            </span>
            <span className="msg-filecard-body">
              {generated && <span className="msg-filecard-eyebrow">Généré par {BRAND.name}</span>}
              <span className="msg-filecard-name">{a.name}</span>
              {/* Le format est sur la tuile : le répéter ici ne disait rien de plus. */}
              <span className="msg-filecard-meta">
                <span className="msg-filecard-shield">
                  <ShieldIcon size={10} />
                  {typeof a.redactions === "number" && a.redactions > 0 ? a.redactions : null}
                </span>
              </span>
            </span>
            <span className="msg-filecard-open" aria-hidden="true">
              <DownloadIcon size={16} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
