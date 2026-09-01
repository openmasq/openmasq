import { TilesIcon, RowsIcon } from "./brand";
import type { ViewMode } from "../hooks/useViewMode";

import { useT } from "../i18n";
const MODES: { id: ViewMode; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: "grid", icon: TilesIcon },
  { id: "list", icon: RowsIcon },
];

/**
 * Grid ⇄ list, the SAME control across the three screens that list objects
 * (Bibliothèque, Compétences, Workflows).
 *
 * One single home (rule 9): three copies would have drifted on the button order, the
 * icon size and the word used — and a display mode is recognised precisely by
 * being in the same place everywhere.
 *
 * `radiogroup` rather than two toggles: the two modes are exclusive, and a screen reader
 * must hear « 1 sur 2 », not two independent switches one of which would be
 * redundant. The label stays in `title`/`aria-label` — at this density, a word per
 * button would cost the very space we're trying to give back.
 */
export function ViewModeToggle({
  mode,
  onChange,
  className = "",
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`om-viewmode ${className}`.trim()} role="radiogroup" aria-label={t.leaves.display}>
      {MODES.map(({ id, icon: Glyph }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          aria-label={id === "grid" ? t.leaves.viewGrid : t.leaves.viewList}
          title={id === "grid" ? t.leaves.viewGrid : t.leaves.viewList}
          className={`om-viewmode-btn${mode === id ? " active" : ""}`}
          onClick={() => onChange(id)}
        >
          <Glyph size={15} />
        </button>
      ))}
    </div>
  );
}
