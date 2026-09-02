import { CheckIcon } from "../../../components/brand";

import { useT } from "../../../i18n";
/**
 * A compétence's INSTRUCTION, framed as a FILE: the prompt is a document
 * written once and replayed, not a form field filled in on every
 * send. A plain textarea + character counter — no formatting bar and no preview:
 * the prompt is markdown the chat renders itself, and a second editor for it was one
 * more thing to learn before writing the one sentence that matters.
 *
 * Pulled out of `SkillModal.tsx` once the modal gained the connector picker: the
 * file went past the 300-line cap (rule 1), and it's the most self-contained block.
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
        </div>
        <textarea
          className="om-skill-file-area"
          value={prompt}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t.lists.skills.prompt.placeholder}
          rows={7}
        />
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
