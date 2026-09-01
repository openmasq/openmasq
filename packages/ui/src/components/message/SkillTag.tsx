import { useState } from "react";
import { SparklesIcon, WorkflowIcon, EditIcon } from "../brand";
import { RedactedText } from "./RedactedText";
import { useOpenSkill } from "../../skills/skillOpen";
import { skillServerMeta } from "../../skills/launch";
import type { Message } from "../../types";

import { useT } from "../../i18n";
/**
 * The compétence tag on a SENT user bubble. The prompt rode the model payload, not the
 * message text (see `schema`'s `Message.competence`), so this is the only trace of it —
 * a chip that expands to reveal what actually went out.
 *
 * ⚠️ **A single tag for the two former lists.** There used to be two, twins, one
 * for « workflows »; here it's the `servers` FIELD that changes the glyph and makes
 * the connectors appear next to the name — not a second component. It renders both
 * `message.competence` and the old `message.workflow` just as well, without which every turn
 * already sent would lose its label (`MessageBubble` does the matching).
 *
 * It shows the SNAPSHOT stored on the message, never today's version of the compétence:
 * the point of opening it is "what did this turn send?", and the answer stops being true
 * the moment someone edits the compétence. "Éditer" is offered separately, and labelled
 * as the thing it is.
 *
 * The prompt renders through `RedactedText` like any bubble text, so a value the engine
 * redacted in it is marked here too — the user sees which parts the model got as fakes.
 */
export function SkillTag({
  competence: skill,
  vault,
  kinds,
}: {
  competence: NonNullable<Message["competence"]>;
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const openSkill = useOpenSkill();
  const servers = (skill.servers ?? []).map(skillServerMeta);

  return (
    <div className="msg-comp">
      <button
        type="button"
        className="msg-tag msg-comp-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? t.conversation.skillTag.hide : t.conversation.skillTag.show}
      >
        {servers.length > 0 ? <WorkflowIcon size={12} /> : <SparklesIcon size={12} />}
        <span>{skill.name}</span>
        {servers.length > 0 && (
          <span className="msg-wf-srvs">
            {servers.map((s) => (
              <span key={s.id} className={`msg-wf-srv tone-${s.tone}`}>
                {s.name}
              </span>
            ))}
          </span>
        )}
        <span className={`msg-comp-caret${open ? " open" : ""}`} aria-hidden="true">
          ›
        </span>
      </button>

      {open && (
        <div className="msg-comp-body">
          <div className="msg-comp-head">
            <span className="cv-eyebrow">{t.conversation.skillTag.promptEyebrow}</span>
            {/* Only offered when the shell wired the provider AND we can still resolve
                the compétence — a deleted one leaves the snapshot readable, not a dead link. */}
            {openSkill && (
              <button
                type="button"
                className="msg-comp-edit"
                onClick={() => openSkill(skill.id)}
              >
                <EditIcon size={12} />
                {t.conversation.skillTag.edit}
              </button>
            )}
          </div>
          {skill.prompt ? (
            <div className="msg-comp-prompt">
              <RedactedText text={skill.prompt} vault={vault} kinds={kinds} />
            </div>
          ) : (
            // The prompt lives in the encrypted DB (it is real user text, stripped from
            // the plaintext copy — `send/sendGuards.ts`). Absent = it hasn't loaded, or
            // this message predates the field. Say so rather than imply it was empty.
            <div className="msg-comp-empty">{t.conversation.skillTag.unavailable}</div>
          )}
        </div>
      )}
    </div>
  );
}
