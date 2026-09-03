import { createPortal } from "react-dom";
import { LOCALES, type Locale } from "@openmasq/i18n";
import { usePopover } from "../../hooks/usePopover";
import { ChevDownIcon, CheckIcon } from "../../components/brand";
import { LanguageFlag } from "../../components/media/CountryFlag";

const GAP = 4;
const WIDTH = 176;

/**
 * The language picker of the Réglages: a FLAG-ONLY trigger that opens a list of the
 * languages, flag and endonym on each line.
 *
 * It replaces the two-segment control, which spelled « Français » and « English » side
 * by side. The trigger shows the flag of the language in use and nothing else — the row
 * next to it already says what the setting is. The words move into the menu, and they
 * stay ENDONYMS (« Français », « English »): they don't change with the current
 * language, and `lang` tells the screen reader how to pronounce them. A flag names a
 * country, never a language, so the button carries its own sentence for assistive tech.
 *
 * Same chrome as the branded dropdown (`om-hue-select`, `compact` variant) and the same
 * popover primitive: portaled, fixed, flipped and clamped by `usePopover`, so it cannot
 * be clipped by the settings pane. The menu is wider than its trigger on purpose —
 * `width: "trigger"` would fit a flag and nothing else.
 */
export function LanguageSelect({
  value,
  names,
  label,
  onChange,
}: {
  value: Locale;
  /** The endonym of each language (`t.language.names`). */
  names: Record<Locale, string>;
  /** The setting's name (`t.language.label`), for the accessible name of the trigger. */
  label: string;
  onChange: (next: Locale) => void;
}) {
  const { open, toggle, close, triggerRef, menuRef, style } = usePopover<HTMLButtonElement, HTMLDivElement>({
    anchor: { gap: GAP, width: WIDTH, align: "right" },
  });

  return (
    <div className="om-hue-select compact">
      <button
        ref={triggerRef}
        type="button"
        className="om-hue-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} : ${names[value]}`}
        onClick={toggle}
      >
        <LanguageFlag locale={value} size={14} />
        <ChevDownIcon size={12} />
      </button>
      {open &&
        style &&
        createPortal(
          <div ref={menuRef} className="om-hue-select-menu" role="listbox" aria-label={label} style={style}>
            {LOCALES.map((loc) => {
              const on = loc === value;
              return (
                <button
                  key={loc}
                  type="button"
                  role="option"
                  aria-selected={on}
                  lang={loc}
                  className={`om-hue-select-item${on ? " on" : ""}`}
                  onClick={() => {
                    onChange(loc);
                    close();
                  }}
                >
                  <LanguageFlag locale={loc} size={13} />
                  <span className="om-hue-select-item-name">{names[loc]}</span>
                  {on && (
                    <span className="om-hue-select-check">
                      <CheckIcon size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
