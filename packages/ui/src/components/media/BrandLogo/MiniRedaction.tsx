import { useEffect, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { cavVars } from "./palette";
import {
  MINI_COLS,
  MINI_ROWS,
  miniAdvance,
  miniInitial,
  miniPosOf,
  miniSettled,
  type MiniState,
} from "./miniRedactionWalk";

/**
 * The mini redaction loader: a small grid redacting CONTINUOUSLY in random palette
 * colours, shown while the model thinks. It says what the wait IS about — the product's own
 * redaction, still working — where three anonymous dots said nothing.
 *
 * The state machine is pure (`miniRedactionWalk.ts`); this only ticks it. Reduced motion holds a
 * settled grid instead of a travelling one.
 */

/** One cell per tick. Slow enough to read each block as it lands, fast enough that the mark
 *  is visibly alive next to a 1.8s phrase cycle. */
const TICK_MS = 380;

export function MiniRedaction({ label }: { label?: string }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<MiniState>(miniInitial);

  useEffect(() => {
    if (reduce) {
      setState(miniSettled());
      return;
    }
    const id = setInterval(() => setState((s) => miniAdvance(s)), TICK_MS);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <span
      className="om-mini"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        gridTemplateColumns: `repeat(${MINI_COLS}, 1fr)`,
        gridTemplateRows: `repeat(${MINI_ROWS}, 1fr)`,
      }}
    >
      {Array.from({ length: MINI_COLS * MINI_ROWS }, (_, i) => {
        // DOM order stays row-major; the redaction travels the cycle, so each cell reads
        // its own walk position.
        const swatch = state.cells[miniPosOf(i % MINI_COLS, Math.floor(i / MINI_COLS))];
        return (
          <span key={i} className="om-mini-cell">
            {swatch !== null && swatch !== undefined && (
              // Per-item runtime hue → the documented inline-style exception (rule 6). The
              // swatch travels with its own ink (`--cav-on`), used as the fill's hairline.
              <span className="om-mini-fill" style={cavVars(swatch) as CSSProperties} />
            )}
          </span>
        );
      })}
    </span>
  );
}
