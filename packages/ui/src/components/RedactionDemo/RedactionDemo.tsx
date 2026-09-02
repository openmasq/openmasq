import { useEffect, useState } from "react";
import { DEMO_SPANS, demoLegend } from "./demo";

import { useT } from "../../i18n";
/**
 * The promise, in motion: the same sentence twice — what you write, and what the model
 * receives — with the sensitive spans flipping to their fakes on a gentle loop.
 *
 * Mounted by first launch AND by « Aide » (chapter « Ce que l'app fait pour
 * vous »): a single demo, so the two can't tell two different products.
 *
 * This replaced the whole category matrix (`privacy/privacyLevel.ts` `TOTAL_CATEGORIES`,
 * read from the catalogue) as the FIRST thing a new user sees. The toggles asked a
 * decision before the concept existed; this shows the concept, and the decision stays one
 * click away (« Régler finement ») and in Réglages for ever after.
 *
 * Motion is a cross-fade on the values only — the sentence never reflows, so the eye
 * stays on what changed. Respects `prefers-reduced-motion` by simply showing the end
 * state (the point is the comparison, and the comparison is spatial, not temporal).
 */
export function RedactionDemo() {
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      setFlipped(true);
      return;
    }
    // One beat on the real values so the eye reads them, then the flip, then a long
    // hold — a loop that informs once, not a blinking ornament.
    const t1 = setTimeout(() => setFlipped(true), 1100);
    const t2 = setInterval(() => setFlipped((f) => !f), 3800);
    return () => {
      clearTimeout(t1);
      clearInterval(t2);
    };
  }, [reduced]);

  return (
    <div className="ob-demo">
      <div className="ob-demo-row">
        <div className="ob-demo-side">
          <div className="cv-eyebrow ob-demo-lbl">          {t.leaves.demo.youWrite}
</div>
          <p className="ob-demo-text">
            {DEMO_SPANS.map((s, i) =>
              s.fake ? (
                <mark key={i} className={`ob-demo-mark hl-${markHue(s.kind)}`}>
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        </div>

        <div className="ob-demo-side">
          <div className="cv-eyebrow ob-demo-lbl">          {t.leaves.demo.modelReceives}
</div>
          <p className="ob-demo-text">
            {DEMO_SPANS.map((s, i) =>
              s.fake ? (
                <mark
                  key={i}
                  className={`ob-demo-mark ob-demo-flip hl-${markHue(s.kind)}${flipped ? " is-fake" : ""}`}
                >
                  <span className="ob-demo-v ob-demo-v-real">{s.text}</span>
                  <span className="ob-demo-v ob-demo-v-fake">{s.fake}</span>
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        </div>
      </div>

      <div className="ob-demo-legend">
        {demoLegend(t).map((l) => (
          <span key={l.kind} className={`ob-demo-chip hl-${l.hue}`}>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** `hueForKind` already ran in `demo.ts` for the legend; the spans re-derive it there
 *  too, so the mark and its legend chip can never wear different colours. The hue does
 *  not depend on the language, so the default catalogue serves. */
function markHue(kind: string | undefined): string {
  return demoLegend().find((l) => l.kind === kind)?.hue ?? "slate";
}
