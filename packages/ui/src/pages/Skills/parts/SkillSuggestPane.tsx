import { useMemo, useState } from "react";
import { SparklesIcon } from "../../../components/brand";
import { skillCategories, skillCategory } from "../../../skills/skills";
import { templateCategory, type AnyTemplate } from "../../../suggestions";

import { useT } from "../../../i18n";
/**
 * The compétence editor's RIGHT column: the ready-made instructions, filterable by
 * category.
 *
 * ⚠️ It serves BOTH template families since the merge: prose prompts and
 * connector-driven routines (the « Routines » chip). Each keeps its own
 * upstream ranking (`suggestions/offered.ts` says why); here we only
 * filter and render, by category — the one question both share is
 * « pour quel genre de travail ? ».
 *
 * Only categories that actually have a template get a chip: an empty filter is a
 * dead end, the same rule the Compétences page applies to its own chips.
 */
export function SkillSuggestPane({
  suggestions,
  pickedId,
  /** Set while the draft holds unsaved edits: picking then needs a 2nd click. */
  confirmingId,
  onPick,
}: {
  suggestions: readonly AnyTemplate[];
  pickedId?: string;
  confirmingId?: string;
  onPick: (id: string) => void;
}) {
  const t = useT();
  const [cat, setCat] = useState("all");
  const chips = useMemo(() => {
    const present = new Set(suggestions.map(templateCategory));
    return [
      { id: "all", label: t.lists.allFeminine },
      ...skillCategories(t).filter((c) => present.has(c.id)),
    ];
  }, [suggestions]);
  const shown = useMemo(
    () => (cat === "all" ? suggestions : suggestions.filter((s) => templateCategory(s) === cat)),
    [suggestions, cat],
  );

  return (
    <div className="om-split-side">
      {/* The column pads through this wrapper — its Workflows twin needs the padding
          inside so its sticky band can span the full width. */}
      <div className="om-side-scroll">
      <div className="om-skill-field">
        <span className="om-sugg-label">
          <SparklesIcon size={13} />
          {t.lists.competences.presets}
        </span>
        <div className="om-sugg-chips">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`om-skill-chip${cat === c.id ? " on" : ""}`}
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="om-sugg-list">
          {shown.map((s) => {
            const on = pickedId === s.id;
            const asking = confirmingId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`om-sugg-card${on ? " on" : ""}${asking ? " asking" : ""}`}
                onClick={() => onPick(s.id)}
                aria-pressed={on}
                title={s.desc}
              >
                <span className="om-sugg-card-name">{s.name}</span>
                <span className="om-sugg-card-desc">
                  {asking ? "Remplacer ce que vous avez écrit ? Cliquez à nouveau." : s.desc}
                </span>
                <span className="om-sugg-card-meta">{skillCategory(templateCategory(s), t).label}</span>
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
