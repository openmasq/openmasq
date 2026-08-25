import { createPortal } from "react-dom";
import { ChevDownIcon, DownloadIcon } from "../../../brand";
import { usePopover } from "../../../../hooks/usePopover";
import { DOWNLOAD_FORMATS, type DownloadFormat, type RichFormat } from "./formats";

/**
 * The document card's « Télécharger » dropdown — one trigger instead of the four side-by-side
 * format buttons, which read as four unrelated actions and wrapped onto a second line on a
 * narrow card (`.md-document-actions` had `flex-wrap` for exactly that).
 *
 * ⚠️ The menu is PORTALED to `<body>` and position:fixed, like `brand/HueSelect`: the card sits
 * inside the message thread, which is an `overflow` scroller — an in-flow menu is clipped by it
 * and, on the last document in the thread, would open into nothing. `usePopover`'s `anchor`
 * owns the flip-above + viewport clamp + close-on-scroll; RIGHT-aligned because the actions
 * sit at the card head's right edge, so a left-aligned menu would hang off the card.
 */

const MENU_W = 208;
/** Enough for the four rows; only used to decide whether to flip, never to clamp. */
const DESIRED_H = 188;

export function DownloadMenu({
  busy,
  onPick,
}: {
  /** The rich format currently being generated, if any — the trigger says so. */
  busy: RichFormat | null;
  onPick: (format: DownloadFormat) => void;
}) {
  const {
    open,
    toggle,
    close,
    triggerRef: btnRef,
    menuRef,
    style,
  } = usePopover<HTMLButtonElement, HTMLDivElement>({
    anchor: { width: MENU_W, desiredHeight: DESIRED_H, align: "right" },
  });

  const label = busy === "pdf" ? "PDF…" : busy === "docx" ? "Word…" : "Télécharger";
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`md-document-dl${busy ? " is-busy" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // Generating blocks the formats (one export at a time) but NOT the menu: the user can
        // still open it to see what else there is.
        onClick={toggle}
      >
        <DownloadIcon size={14} /> {label}
        <ChevDownIcon size={12} />
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={menuRef}
            className="md-document-dlmenu"
            role="menu"
            aria-label="Formats de téléchargement"
            // Runtime-computed position on a portaled popover — the allowed inline-style case.
            style={style}
          >
            {DOWNLOAD_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitem"
                className="md-document-dlmenu-item"
                disabled={busy !== null}
                onClick={() => {
                  close();
                  onPick(f.id);
                }}
              >
                <span className={`md-document-dlmenu-label${f.mono ? " mono" : ""}`}>
                  {f.label}
                </span>
                <span className="md-document-dlmenu-hint">{f.hint}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
