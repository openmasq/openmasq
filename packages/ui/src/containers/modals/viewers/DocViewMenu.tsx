import { useEffect, useRef, useState } from "react";
import { CheckIcon, DotsIcon, ShieldIcon } from "../../../components/brand";

export type DocView = "pdf" | "rich" | "image" | "rendu" | "original" | "redacted" | "ocr";

export interface DocViewOption {
  id: DocView;
  label: string;
  /** One line saying what the layer IS — « Couche OCR » means nothing on its own. */
  hint?: string;
  /** Prefix the label with the shield: this view is a redacted one. */
  shield?: boolean;
}

/**
 * The document preview's LAYER picker, sat in the modal's top-right corner beside the
 * close button — the same choice the header tab strip used to offer, minus the row it
 * ate out of the document's height.
 *
 * The menu is an in-flow absolute child on purpose (no portal, unlike `HueSelect`): it
 * opens DOWNWARD from the top of `.modal-panel`, so the panel's `overflow:hidden` never
 * clips it, and it then travels with the panel's own zoom-in animation.
 */
export function DocViewMenu({
  views,
  view,
  onPick,
}: {
  views: DocViewOption[];
  view: DocView;
  onPick: (id: DocView) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // CAPTURE + stopPropagation: `ModalShell` closes the whole modal on Escape from a
    // bubble-phase window listener, so without this the first Escape would dismiss the
    // document instead of the menu it was aimed at.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  const current = views.find((v) => v.id === view) ?? views[0];
  if (!current) return null;

  return (
    <div className="fv-viewmenu" ref={ref}>
      {/* A tri-dot, not a labelled control: the header already names the file, and the
          current layer is stated by the menu's own check — spelling it on the button
          spent the width the filename needs. */}
      <button
        type="button"
        className={`fv-viewmenu-btn${open ? " on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Changer de vue"
        title={`Vue : ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <DotsIcon size={18} />
      </button>
      {open && (
        <div className="fv-viewmenu-menu" role="listbox" aria-label="Vue du document">
          {views.map((v) => {
            const on = v.id === current.id;
            return (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={on}
                className={`fv-viewmenu-item${on ? " on" : ""}`}
                onClick={() => {
                  onPick(v.id);
                  setOpen(false);
                }}
              >
                <span className="fv-viewmenu-item-main">
                  <span className="fv-viewmenu-item-name">
                    {v.shield && <ShieldIcon size={12} />}
                    {v.label}
                  </span>
                  {v.hint && <span className="fv-viewmenu-hint">{v.hint}</span>}
                </span>
                {on && (
                  <span className="fv-viewmenu-check">
                    <CheckIcon size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
