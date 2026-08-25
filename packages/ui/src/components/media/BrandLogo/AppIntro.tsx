import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BrandMark } from "./BrandMark";
import { GRID_COLS, GRID_ROWS, assignSwatches, buildRedactionShape, isUnderLogo } from "./redactionShape";
import { CAV_SWATCHES, cavVars } from "./palette";

/**
 * One-shot intro played on app open: a skeleton scaffold of the app (icon rail +
 * message rows) shimmers in the highlight palette while the brand mark pulses
 * over it — the app "developing" under the brand. The overlay then fades out
 * (exit) and unmounts. Reduced motion → a plain quick fade. Rendered inside an
 * <AnimatePresence> by AppShell.
 *
 * NOTHING sits behind the mark: no halo, and the blue themes' grid — centred on it — leaves
 * the cells it covers blank, so the mark sits IN a hole rather than on top of a lattice.
 */

/* Highlight hues cycled across the skeleton tiles (design-kit SKEL_HL). */
const SKEL_HUES = ["lime", "pink", "sky", "violet", "amber"] as const;
const RAIL_ICONS = [0, 1, 2, 3, 4, 5];
const ROWS = [0, 1, 2, 3, 4];

export function AppIntro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // A fresh random redaction shape per app open (stable for this mount), plus the swatch
  // each cell wears — derived once, not per render: both feed animation delays.
  const [redacted] = useState(buildRedactionShape);
  const [swatches] = useState(() => assignSwatches(redacted, CAV_SWATCHES.length));
  // One pulse of the mark (~1.8s), then hand back; reduced motion exits fast.
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), reduce ? 480 : 1800);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <motion.div
      className="app-intro"
      // Fade IN (not a pop) so this cross-fades over the boot splash rather than snapping
      // in — the boot splash shares this ground + mark ink, so the hand-off reads as one
      // continuous loader.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="intro-skel" aria-hidden="true">
        <div className="intro-skel-rail">
          <span className="intro-skel-logo" />
          {RAIL_ICONS.map((i) => (
            <span
              key={i}
              className="intro-skel-ico"
              style={{
                animationDelay: `${i * 0.12}s`,
                background: `var(--hl-${SKEL_HUES[i % SKEL_HUES.length]})`,
              }}
            />
          ))}
        </div>
        <div className="intro-skel-main">
          {ROWS.map((r) => (
            <div
              key={r}
              className="intro-skel-row"
              style={{ animationDelay: `${r * 0.14}s` }}
            >
              <span
                className="intro-skel-av"
                style={{ background: `var(--hl-${SKEL_HUES[r % SKEL_HUES.length]})` }}
              />
              <span className="intro-skel-lines">
                <span
                  className="intro-skel-line"
                  style={{ width: `${58 + ((r * 9) % 34)}%` }}
                />
                <span
                  className="intro-skel-line"
                  style={{ width: `${34 + ((r * 13) % 40)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Blue / blue-dark only (CSS-gated): a faint grid whose randomly-formed cells fill in
          the redaction palette. Centred on the mark, and HOLLOWED where it sits. */}
      <div
        className="intro-grid"
        aria-hidden="true"
        style={{
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);
          // The grid draws in as a diagonal sweep, cell by cell — the stagger (last cell
          // ≈0.7s) is deliberately longer than a cell's own quick fade so the rectangle
          // visibly BUILDS instead of appearing at once. Each redacted cell then fills a
          // beat after its own line has arrived, in walk order; the slowest fill lands
          // ≈1.6s, inside the 1.8s the intro is on screen.
          const lineDelay = (col + row) * 0.026;
          const fillOrder = redacted.get(i);
          return (
            <span
              key={i}
              // A cell the mark covers draws nothing — that hole IS how the logo sits in
              // the grid instead of on top of it.
              className={isUnderLogo(col, row) ? "intro-cell is-clear" : "intro-cell"}
              style={{ animationDelay: `${lineDelay}s` }}
            >
              {fillOrder !== undefined && (
                <span
                  className="intro-cell-fill"
                  // The swatch is a per-item runtime value (rule 6's inline exception), and
                  // it travels with its OWN ink for the hairline — the lime block on a light
                  // ground is 1.25:1, so an edgeless one would simply not be there.
                  style={
                    {
                      animationDelay: `${lineDelay + 0.18 + fillOrder * 0.026}s`,
                      ...cavVars(swatches.get(i) ?? 0),
                    } as CSSProperties
                  }
                />
              )}
            </span>
          );
        })}
      </div>
      <div className="intro-mark">
        <BrandMark size={68} />
      </div>
    </motion.div>
  );
}
