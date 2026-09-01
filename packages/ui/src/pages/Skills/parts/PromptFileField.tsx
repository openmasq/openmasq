import { useRef, useState } from "react";
import { CheckIcon, EyeIcon } from "../../../components/brand";
import { Markdown } from "../../../components/markdown/Markdown";
import { PromptToolbar } from "../PromptToolbar";
import { applyPromptMark } from "../promptFormat";

import { useT } from "../../../i18n";
/**
 * A compétence's INSTRUCTION, framed as a FILE: the prompt is a document
 * written once and replayed, not a form field filled in on every
 * send. Formatting toolbar, Preview toggle, character counter.
 *
 * Pulled out of `CompetenceModal.tsx` once the modal gained the connector picker: the
 * file went past the 300-line cap (rule 1), and it's the most self-contained block —
 * it only holds its own text selection and its own preview mode.
 */
export function PromptFileField({
  prompt,
  onChange,
  /** The sentence under the field. It changes depending on whether the compétence drives tools. */
  note,
}: {
  prompt: string;
  onChange: (next: string) => void;
  note: string;
}) {
  const t = useT();
  // Rendered preview vs the editable source. The toolbar hides with the textarea: there
  // is nothing to format in a read-only render.
  const [preview, setPreview] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="om-skill-field">
      <div className="om-skill-promptlbl">
        <span className="cv-eyebrow">{t.lists.skills.prompt.label}</span>
        <span className="om-skill-chars">{t.lists.skills.prompt.chars(prompt.length)}</span>
      </div>
      <div className="om-skill-file">
        <div className="om-skill-file-bar">
          <span className="om-skill-file-dot" aria-hidden="true" />
          <span className="om-skill-file-name">{t.lists.skills.prompt.fileName}</span>
          <div className="flex-spacer" />
          <button
            type="button"
            className={`om-skill-preview-btn${preview ? " on" : ""}`}
            onClick={() => setPreview((v) => !v)}
            aria-pressed={preview}
          >
            <EyeIcon size={13} />
            {t.lists.skills.prompt.preview}
          </button>
        </div>
        {!preview && (
          <PromptToolbar
            onMark={(m) => {
              const el = areaRef.current;
              if (!el) return;
              const next = applyPromptMark(prompt, el.selectionStart, el.selectionEnd, m);
              onChange(next.text);
              // Restore the selection AFTER React commits the new value, or the
              // browser parks the caret at the end and the next click formats
              // the wrong span.
              requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(next.start, next.end);
              });
            }}
          />
        )}
        {preview ? (
          // The SAME renderer the chat uses, so what you see here is what the
          // reply will look like — no second markdown flavour to drift from.
          <div className="om-skill-file-preview">
            {prompt.trim() ? (
              <Markdown content={prompt} />
            ) : (
              <span className="om-skill-preview-empty">{t.lists.skills.prompt.previewEmpty}</span>
            )}
          </div>
        ) : (
          <textarea
            ref={areaRef}
            className="om-skill-file-area"
            value={prompt}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t.lists.skills.prompt.placeholder}
            rows={7}
          />
        )}
      </div>
      <span className="om-skill-note">
        <span className="om-skill-note-badge" aria-hidden="true">
          <CheckIcon size={9} />
        </span>
        <span>{note}</span>
      </span>
    </div>
  );
}
