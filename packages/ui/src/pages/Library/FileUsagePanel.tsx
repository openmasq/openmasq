import { findModel } from "@openmasq/llm";
import type { Conversation } from "../../types";
import { findModelAny } from "../../prompt/models";
import { ArrowRightIcon, ModelLogo } from "../../components/brand";
import { fmtDate } from "./libraryKinds";
import type { ReattachSource } from "./reattach";
import { conversationSnippet, fileAnchorIn, useFileUsage, type UsageFile } from "./useFileUsage";

import { useT } from "../../i18n";
export type { UsageFile };

/**
 * The "Utilisé dans les conversations" tab body of the file viewer: which
 * conversations have used the SAME file (matched by content hash), each
 * openable, plus "re-attach to a new conversation" (re-redacted from the
 * original bytes in the new conversation's vault).
 */
export function FileUsagePanel({
  file,
  conversations,
  onOpenConversation,
  onReattach,
  onOpenInTab,
}: {
  file: UsageFile;
  conversations: Conversation[];
  /** `msgId` = the message the file was ATTACHED to (its anchor in the thread),
   *  when it can be resolved — the caller scrolls + flashes it on arrival. */
  onOpenConversation: (localId: string, msgId?: string) => void;
  onReattach: (src: ReattachSource) => void;
  /** Unified tabs: open this document as a FILE TAB in the workspace (kit design).
   *  Absent on surfaces without the tab system (mobile). */
  onOpenInTab?: (src: ReattachSource) => void;
}) {
  const t = useT();
  const { used, loading } = useFileUsage(file, conversations);

  return (
    <div className="om-usage">
      <div className="cv-eyebrow">
        {loading
          ? t.lists.library.conversationsLoading
          : t.lists.library.usedIn(used.length)}
      </div>
      <div className="om-usage-list">
        {!loading && used.length === 0 && (
          <p className="om-usage-none">
            {t.lists.library.notUsed}
          </p>
        )}
        {used.map((c) => {
          const model = findModelAny(c.modelId) ?? findModel(c.modelId);
          const snippet = conversationSnippet(c);
          return (
            <button
              key={c.id}
              type="button"
              className="om-usage-row"
              onClick={() => onOpenConversation(c.id, fileAnchorIn(c, file.name))}
            >
              {model && (
                <span className="om-usage-logo">
                  <ModelLogo provider={model.provider} modelId={model.id} size={30} tile />
                </span>
              )}
              <span className="om-usage-main">
                <span className="om-usage-title">{c.title || "Nouvelle conversation"}</span>
                {/* No snippet rather than an empty line — an attachment-only thread has
                    nothing to quote, and inventing one would be a fabricated fact. */}
                {snippet && <span className="om-usage-snippet">{snippet}</span>}
              </span>
              <span className="om-usage-date">{fmtDate(c.updatedAt)}</span>
              <span className="om-usage-chev" aria-hidden="true">
                <ArrowRightIcon size={15} />
              </span>
            </button>
          );
        })}
      </div>
      <button
        className="btn-primary btn-inline self-start"
        onClick={() =>
          onReattach({
            id: file.id,
            name: file.name,
            mime: file.mime,
          })
        }
      >
        {t.lists.library.reattach} <ArrowRightIcon size={15} />
      </button>
      {onOpenInTab && (
        <button
          className="btn-secondary btn-inline self-start"
          onClick={() => onOpenInTab({ id: file.id, name: file.name, mime: file.mime })}
        >
          {t.lists.library.openInTab}
        </button>
      )}
    </div>
  );
}
