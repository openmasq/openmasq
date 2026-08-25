import { createPortal } from "react-dom";
import { usePopover } from "../../hooks/usePopover";
import { ChevDownIcon, CheckIcon } from "./icons";

/** One choice. `tone` is a HIGHLIGHT-palette key (pink/amber/sky/lime/mint/violet) —
 *  the redaction-marker hues, which are the brand's colour language. `glyph` is
 *  optional: with one, the swatch is a tinted tile carrying it; without, a plain dot.
 *  ⚠️ A glyph must exist in `--font-display` — "✍" renders blank. */
export interface HueOption {
  value: string;
  label: string;
  tone: string;
  glyph?: string;
}

const GAP = 4;
const DESIRED = 280;

/**
 * THE branded single-choice dropdown for anything whose options carry a highlight hue —
 * the Coffre's data type, a compétence's category. Replaces the native `<select>`, which
 * cannot show the hue and wears the OS chrome instead of the brand's.
 *
 * A pure leaf: it knows nothing about redaction or compétences. Callers map their own
 * vocabulary to `HueOption[]`, so the hue/glyph stay owned by the domain
 * (`competences.ts`, `redactTypes.ts`) and this file never grows a switch over them.
 *
 * ⚠️ The menu is PORTALED to `document.body` with FIXED positioning, never `absolute`
 * in-flow: both call sites live inside an `overflow` ancestor (the Coffre's scroll panel,
 * the Compétences modal), which CLIPS an in-flow menu and runs it off the app on a short
 * window. `usePopover`'s `anchor` owns that: flip-above, viewport clamp, and close (not
 * re-place) on scroll — a fixed menu would otherwise drift from its button. This is the
 * one caller that needs `clampHeight`: the option list can be long enough to overrun a
 * short viewport, where the four-row menus cannot.
 */
export function HueSelect({
  value,
  options,
  onChange,
  ariaLabel,
  neutral = false,
}: {
  value: string;
  options: HueOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** Render the swatches MONOCHROME (sunken tile / faint dot) — for callers whose
   *  options are ordinary categories, not the redaction hues (the Compétences
   *  picker). The Coffre keeps the colours: there the hue IS the data's meaning. */
  neutral?: boolean;
}) {
  const {
    open,
    toggle,
    close,
    triggerRef: btnRef,
    menuRef,
    style,
  } = usePopover<HTMLButtonElement, HTMLDivElement>({
    anchor: { gap: GAP, width: "trigger", desiredHeight: DESIRED, clampHeight: true },
  });
  // Never undefined: an unknown value falls back to the first option, so the button
  // always renders a label rather than collapsing to an empty control.
  const current = options.find((o) => o.value === value) ?? options[0];

  if (!current) return null;

  return (
    <div className="om-hue-select">
      <button
        ref={btnRef}
        type="button"
        className="om-hue-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
      >
        <Swatch opt={current} neutral={neutral} />
        <span className="om-hue-select-label">{current.label}</span>
        <ChevDownIcon size={12} />
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={menuRef}
            className="om-hue-select-menu"
            role="listbox"
            aria-label={ariaLabel}
            style={style}
          >
            {options.map((o) => {
              const on = o.value === current.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`om-hue-select-item${on ? " on" : ""}`}
                  onClick={() => {
                    onChange(o.value);
                    close();
                  }}
                >
                  <Swatch opt={o} neutral={neutral} />
                  <span className="om-hue-select-item-name">{o.label}</span>
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

/** The hue affordance: a glyph tile when the option has one, else a plain dot. Both are
 *  per-option DATA, so the colour is a runtime value — rule 6's sanctioned exception.
 *  `neutral` drops the hue entirely (monochrome tile/dot, styled in hueSelect.css). */
function Swatch({ opt, neutral = false }: { opt: HueOption; neutral?: boolean }) {
  if (neutral) {
    return opt.glyph ? (
      <span className="om-hue-glyph neutral" aria-hidden="true">
        {opt.glyph}
      </span>
    ) : (
      <span className="om-hue-dot" />
    );
  }
  return opt.glyph ? (
    // The glyph sits ON the hue, so its ink comes from that hue's own token — the CSS
    // default (`--brand`) is a blue in the blue themes and would vanish on the blue
    // and violet tiles. Runtime-computed from per-option data, hence inline (rule 6).
    <span
      className="om-hue-glyph"
      style={{ background: `var(--hl-${opt.tone})`, color: `var(--ink-on-hl-${opt.tone})` }}
      aria-hidden="true"
    >
      {opt.glyph}
    </span>
  ) : (
    <span className={`om-hue-dot hl-${opt.tone}`} />
  );
}
