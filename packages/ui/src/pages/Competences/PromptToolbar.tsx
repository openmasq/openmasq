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
const MARKS: { id: PromptMark; label: string; title: string; cls?: string }[] = [
  { id: "bold", label: "B", title: "Gras", cls: "b" },
  { id: "italic", label: "I", title: "Italique", cls: "i" },
  { id: "heading", label: "H", title: "Titre" },
  { id: "quote", label: "❝", title: "Citation" },
  { id: "bullet", label: "•", title: "Liste à puces" },
  { id: "ordered", label: "1.", title: "Liste numérotée" },
  { id: "code", label: "</>", title: "Code", cls: "code" },
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
          title={m.title}
          aria-label={m.title}
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
