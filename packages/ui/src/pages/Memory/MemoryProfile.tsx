import { BRAND } from "@openmasq/branding";
import { useState } from "react";
import { MAX_PROFILE_CHARS } from "../../memory";
import type { MemoryData } from "../../types";

import { useT } from "../../i18n";
/** The PROFILE card above the stage — the always-injected standing context, with its
 *  own edit draft. Split out of `MemoryView` (300-LOC cap, rule 1); the draft state
 *  lives here because nothing else reads it. */
export function MemoryProfile({
  memoryData,
  onSetProfile,
}: {
  memoryData: MemoryData;
  onSetProfile: (profile: string) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <section className="om-skill-card om-mem-profile">
      <div className="om-skill-card-head">
        <span className="om-skill-name">{t.lists.memory.profile.title}</span>
        <span className="om-skill-spacer" />
        {draft === null ? (
          <button type="button" className="om-skill-use" onClick={() => setDraft(memoryData.profile ?? "")}>
            {t.lists.memory.profile.edit}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="om-skill-use"
              onClick={() => {
                onSetProfile(draft);
                setDraft(null);
              }}
            >
              {t.common.save}
            </button>
            <button type="button" className="om-skill-use" onClick={() => setDraft(null)}>
              {t.common.cancel}
            </button>
          </>
        )}
      </div>
      {draft === null ? (
        // Click-to-edit — the same contract as the chat's document card: the text
        // IS the affordance; a selection in progress (copy) swallows the click.
        <p
          className="om-skill-desc om-mem-profile-text"
          title={t.lists.memory.profile.editTip}
          onClick={() => {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) return;
            setDraft(memoryData.profile ?? "");
          }}
        >
          {memoryData.profile?.trim() || t.lists.memory.profile.emptyText(BRAND.name)}
        </p>
      ) : (
        <>
          <textarea
            className="om-mem-textarea"
            value={draft}
            maxLength={MAX_PROFILE_CHARS}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.lists.memory.profile.placeholder}
            aria-label={t.lists.memory.profile.aria}
          />
          {/* The limit, stated: the profile rides with EVERY send, its size is a
              budget — not a free-text field that silently truncates. */}
          <span className="om-mem-limit">
            {draft.length}/{MAX_PROFILE_CHARS}
            {t.lists.memory.profile.limitNote}
          </span>
        </>
      )}
    </section>
  );
}
