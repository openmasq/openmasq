import { BRAND } from "@openmasq/branding";
import { useMemo, useState } from "react";
import type { Conversation } from "../../../types";
import { findModelAny } from "../../../prompt/models";
import { Avatar, ModelLogo, PlusIcon, SearchIcon, ShieldIcon } from "../../../components/brand";
import { BrandMark } from "../../../components/media/BrandLogo";
import { groupConversationsByDate, relTime } from "../../../hooks/conversationGroups";
import { conversationProtectedCount } from "../../../state/protectedCount";

import { useT } from "../../../i18n";
interface Props {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onNew: () => void;
  /** The avatar button — account & settings (kit: profile chip → settings). */
  onOpenSettings: () => void;
  userName?: string;
}

/**
 * Mobile HOME — the `chat-app-mobile` kit's ChatList screen. On mobile the
 * conversation list is a full screen of its own (not a drawer): brand header,
 * inline search, date-grouped threads, and the new-chat FAB. Tapping a thread
 * "pushes" the chat screen (AppShell owns that navigation state).
 */
export function MobileChatList({ conversations, onSelect, onNew, onOpenSettings, userName = "Vous" }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const last = c.messages[c.messages.length - 1]?.content ?? "";
      return `${c.title} ${last}`.toLowerCase().includes(q);
    });
  }, [conversations, query]);
  const groups = useMemo(() => groupConversationsByDate(filtered, t), [filtered, t]);

  return (
    <div className="mobile-home">
      <header className="mobile-home-head">
        <div className="mobile-home-brand">
          <BrandMark size={24} className="brand-mark" />
          <span className="cv-wordmark cv-display">{BRAND.name}</span>
        </div>
        <button
          type="button"
          className="mobile-home-account"
          onClick={onOpenSettings}
          aria-label={t.shell.mobile.accountAndSettings}
        >
          <Avatar name={userName} size={30} muted />
        </button>
      </header>

      <label className="mobile-home-search">
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.shell.mobile.searchConversation}
          aria-label={t.shell.mobile.searchConversationAria}
        />
      </label>

      <div className="mobile-home-list">
        {filtered.length === 0 && (
          <p className="empty-hint">
            {query ? t.shell.mobile.noMatch : t.chrome.noConversations}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.key}>
            <div className="cv-eyebrow">{group.label}</div>
            {group.items.map((c) => {
              const model = findModelAny(c.modelId);
              const last = c.messages[c.messages.length - 1];
              const protectedN = conversationProtectedCount(c);
              return (
                <button key={c.id} type="button" className="mobile-thread" onClick={() => onSelect(c.id)}>
                  <span className="mobile-thread-logo">
                    {model && <ModelLogo provider={model.provider} modelId={model.id} size={20} />}
                  </span>
                  <span className="mobile-thread-body">
                    <span className="mobile-thread-top">
                      <span className="mobile-thread-title">{c.title || t.chrome.untitledConversation}</span>
                      <span className="mobile-thread-time">{relTime(c.updatedAt, t)}</span>
                    </span>
                    <span className="mobile-thread-bottom">
                      <span className="mobile-thread-snippet">{last?.content || t.shell.mobile.emptyConversation}</span>
                      {protectedN > 0 && (
                        <span className="mobile-thread-shield" title={t.shell.mobile.redactedCount(protectedN)}>
                          <ShieldIcon size={11} />
                          {protectedN}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <button type="button" className="mobile-fab" onClick={onNew} aria-label={t.chrome.newChat}>
        <PlusIcon size={24} />
      </button>
    </div>
  );
}
