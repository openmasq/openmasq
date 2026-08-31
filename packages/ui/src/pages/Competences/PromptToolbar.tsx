import type { PromptMark } from "./promptFormat";

import { useT } from "../../i18n";
/**
 * The prompt editor's markdown toolbar. Pure: it reports which mark was pressed and the
 * modal applies it (`promptFormat.ts` owns the text maths, and is unit-tested).
 *
 * `onMouseDown` + `preventDefault` rather than `onClick`: pressing a button would
 * otherwise blur the textarea first, dropping the selection the mark is supposed to
 * wrap — the toolbar would format nothing.
 */
/** Le GLYPHE de chaque bouton (il ne se traduit pas) ; son nom vient du catalogue. */
const MARKS: { id: PromptMark; label: string; cls?: string }[] = [
  { id: "bold", label: "B", cls: "b" },
  { id: "italic", label: "I", cls: "i" },
  { id: "heading", label: "H" },
  { id: "quote", label: "❝" },
  { id: "bullet", label: "•" },
  { id: "ordered", label: "1." },
  { id: "code", label: "</>", cls: "code" },
];

export function PromptToolbar({ onMark }: { onMark: (m: PromptMark) => void }) {
  const t = useT();
  return (
    <div className="om-skill-toolbar" role="toolbar" aria-label={t.lists.competences.formatting}>
      {MARKS.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`om-skill-tool${m.cls ? ` ${m.cls}` : ""}`}
          title={t.lists.marks[m.id]}
          aria-label={t.lists.marks[m.id]}
          onMouseDown={(e) => {
            e.preventDefault();
            onMark(m.id);
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
