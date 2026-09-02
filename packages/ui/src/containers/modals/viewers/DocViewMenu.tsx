import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../../../i18n";
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away, true);
    return () => document.removeEventListener("mousedown", away, true);
  }, [open]);
  // Escape aims at the INNERMOST open layer. Focus sits on the tri-dot or an option
  // whenever the menu is open, so the key reaches this root; closing the menu and
  // marking the key consumed (`preventDefault`) is what keeps `ModalShell` — which
  // yields to a consumed Escape — from dismissing the document underneath as well.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !open) return;
    e.preventDefault();
    setOpen(false);
  };

  const current = views.find((v) => v.id === view) ?? views[0];
  if (!current) return null;

  return (
    <div className="fv-viewmenu" ref={ref} onKeyDown={onKeyDown}>
      {/* A tri-dot, not a labelled control: the header already names the file, and the
          current layer is stated by the menu's own check — spelling it on the button
          spent the width the filename needs. */}
      <button
        type="button"
        className={`fv-viewmenu-btn${open ? " on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.menus.docView.changeAria}
        title={t.menus.docView.currentTip(current.label)}
        onClick={() => setOpen((o) => !o)}
      >
        <DotsIcon size={18} />
      </button>
      {open && (
        <div className="fv-viewmenu-menu" role="listbox" aria-label={t.menus.docView.listAria}>
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
