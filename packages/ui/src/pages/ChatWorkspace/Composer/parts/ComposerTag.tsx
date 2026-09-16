import { useEffect, useState } from "react";
import type { Messages } from "@openmasq/i18n";
import {
  ActivityIcon,
  FileIcon,
  FolderIcon,
  MessageIcon,
  SparklesIcon,
  WorkflowIcon,
} from "../../../../components/brand";
import { Markdown } from "../../../../components/markdown/Markdown";
import { cappedSlots } from "../../../../skills/launch";
import type { ComposerTagInfo } from "../types";

interface Props {
  tag: ComposerTagInfo;
  onClearTag?: () => void;
  onEditTag?: () => void;
  t: Messages;
}

/**
 * The removable chip above the input for the staged intent. The hover peek shows the EXACT
 * prompt the send will carry, with the chat's own Markdown — plain positioned DOM, no dialog
 * role (it must never trip the agent-browser modal gate).
 */
export function ComposerTag({ tag, onClearTag, onEditTag, t }: Props) {
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    setPeek(false);
  }, [tag.label]);
  return (
    <div
      className={`composer-tag tone-${tag.tone}`}
      onMouseEnter={tag.preview ? () => setPeek(true) : undefined}
      onMouseLeave={tag.preview ? () => setPeek(false) : undefined}
    >
      {peek && tag.preview && (
        <div className="composer-tag-pop">
          <div className="composer-tag-pop-body">
            <Markdown content={tag.preview} />
          </div>
          <div className="composer-tag-pop-hint">
            Envoyée avec votre message{onEditTag ? " · cliquez le nom pour éditer" : ""}
          </div>
        </div>
      )}
      <TagGlyph tag={tag} />
      {onEditTag ? (
        <button type="button" className="composer-tag-edit" onClick={onEditTag} title={t.composer.editSkill}>
          {tag.label}
        </button>
      ) : (
        <span>{tag.label}</span>
      )}
      {tag.servers && tag.servers.length > 0 && (
        <span className="composer-tag-srvs">
          {tag.servers.map((s) => (
            <span key={s.id} className={`composer-tag-srv tone-${s.tone}`}>
              {s.name}
            </span>
          ))}
        </span>
      )}
      {tag.slots && tag.slots.length > 0 && <TagSlots slots={tag.slots} title={t.composer.slotsToFill} />}
      <button type="button" className="composer-tag-x" aria-label={t.composer.removeTool} onClick={onClearTag}>
        ×
      </button>
    </div>
  );
}

/** `sky` is the staged compétence, `violet` one that drives connectors, `lime` a selection tag. */
function TagGlyph({ tag }: { tag: ComposerTagInfo }) {
  if (tag.glyph === "folder") return <FolderIcon size={13} />;
  if (tag.glyph === "file") return <FileIcon size={13} />;
  if (tag.tone === "lime") return <ActivityIcon size={13} />;
  if (tag.tone === "sky") return <SparklesIcon size={13} />;
  if (tag.tone === "violet") return <WorkflowIcon size={13} />;
  return <MessageIcon size={13} />;
}

/** The blanks to fill in — dashed outline, CAPPED so a template with many braces keeps the row. */
function TagSlots({ slots, title }: { slots: string[]; title: string }) {
  const { shown, hidden } = cappedSlots(slots);
  return (
    <span className="composer-tag-srvs" title={title}>
      {shown.map((s) => (
        <span key={s} className="composer-tag-slot">{`{${s}}`}</span>
      ))}
      {hidden.length > 0 && (
        <span className="composer-tag-slot" title={hidden.map((h) => `{${h}}`).join(" ")}>{`+${hidden.length}`}</span>
      )}
    </span>
  );
}
