import { BRAND } from "@openmasq/branding";
import { useT } from "../../i18n";
import { useEffect } from "react";
import { ShieldIcon } from "../../components/brand";

/**
 * The one-tap un-redact popover: CLICK a highlighted word in the composer and keep
 * it in clear right there — the chips row stays the overview, but with many
 * detections it is unmanageable as the only path. Same session-scoped effect as
 * un-ticking the chip (`toggleKeep`): the value is sent EN CLAIR for this message.
 *
 * `data-sel-menu` keeps the textarea-selection dismiss logic from eating the click;
 * outside-mousedown / Escape / scroll close it, like `SelectionMenu`.
 */
export function MarkKeepMenu({
  x,
  y,
  value,
  hue,
  uncertain,
  onKeep,
  onClose,
}: {
  x: number;
  y: number;
  value: string;
  hue: string;
  /** « À vérifier » : détection à source unique et signal faible — le popover le DIT,
   *  pour que « Garder en clair » soit un choix éclairé. Le redaction, lui, ne change
   *  pas : la valeur part masquée tant que l'utilisateur ne décide pas l'inverse. */
  uncertain?: boolean;
  onKeep: () => void;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-sel-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = () => onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const label = value.length > 28 ? `${value.slice(0, 28)}…` : value;
  return (
    // Width is unknown until render; anchoring at the pointer is the runtime-computed
    // inline-style case rule 6 allows.
    <div className="mark-keep-menu" data-sel-menu style={{ left: x, top: y }} role="menu">
      <span className={`mark-keep-value hl-${hue}${uncertain ? " mk-doubt" : ""}`}>{label}</span>
      {uncertain && <span className="mark-keep-doubt">{t.menus.markKeep.uncertain(BRAND.name)}</span>}
      <button
        type="button"
        role="menuitem"
        className="mark-keep-btn"
        title={t.menus.markKeep.keepTip}
        onClick={() => {
          onKeep();
          onClose();
        }}
      >
        <ShieldIcon size={12} /> {t.menus.markKeep.keep}
      </button>
    </div>
  );
}
