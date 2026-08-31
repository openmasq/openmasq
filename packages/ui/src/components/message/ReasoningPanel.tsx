import { useState } from "react";
import { ChevDownIcon } from "../brand";

import { useT } from "../../i18n";
/**
 * The model's REFLECTION, once it is no longer the only thing on screen.
 *
 * `ThinkingIndicator` shows it LIVE, tail-cropped, while the turn has nothing else to
 * show. This is its second life: the turn produced an answer (or failed, or was
 * stopped) and the reflection is kept rather than dropped — it is the only account of
 * where a 40-second turn went, and erasing it at the exact moment the answer appeared
 * destroyed it just as the user became able to read it.
 *
 * **Collapsed by default, and that is the whole design.** A thinking model emits
 * thousands of tokens of reflection; expanded, it would push the answer — the thing
 * actually asked for — below the fold on every turn. So the resting state is one
 * discreet line, and reading it is a deliberate click.
 *
 * The text is already un-redacted (`state/reasoningRelay.ts` runs it through the
 * conversation's vault), so it shows the user's REAL values like the answer does.
 * Rendered as plain text, never Markdown: a reflection is a draft — half-open fences
 * and stray `#` are normal in it, and a Markdown pass would turn that draft into
 * headings and code blocks that compete with the reply.
 */
export function ReasoningPanel({ text }: { text: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={`om-reflect${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="om-reflect-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevDownIcon size={12} />
        <span>{t.conversation.bubble.reasoning}</span>
      </button>
      {open && <div className="om-reflect-body">{text}</div>}
    </div>
  );
}
