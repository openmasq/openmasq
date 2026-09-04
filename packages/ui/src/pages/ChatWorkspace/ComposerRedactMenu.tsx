import { useEffect, useRef, type KeyboardEvent } from "react";
import { CheckIcon, EyeIcon, LevelsIcon, LockIcon } from "../../components/brand";
import { levelBars, privacyLevelMeta, type PrivacyLevel } from "../../privacy/privacyLevel";
import { useT } from "../../i18n";
import type { Conversation, Settings } from "../../types";

export type AppliedLevel = Exclude<PrivacyLevel, "custom">;

/** The scope a click writes: the open conversation, or the global default. */
export type LevelScope = "conversation" | "default";

/** What a write REPLACED — `restore` takes it back (the pill's « Annuler »). */
export type LevelSnapshot =
  | { scope: "conversation"; convId: string; cats: Conversation["redactCategories"] | undefined }
  | { scope: "default"; cats: Settings["redactCategories"] };

/** One applied change, as the button reports it (confirmation pill + undo). */
export interface AppliedChange {
  level: AppliedLevel;
  scope: LevelScope;
  snap: LevelSnapshot;
}

export interface RedactLevelApi {
  /** The EFFECTIVE level of the open conversation (override ⊕ global), or the global
   *  default when no conversation exists yet. */
  level: PrivacyLevel;
  /** How many bars the button's glyph carries — `levelBars` of the current level. */
  bars: 1 | 2 | 3;
  /** The open conversation deviates from the default (an override that changes something). */
  overridden: boolean;
  /** Categories the organization mandates ON whatever the level — the menu says so. */
  forcedCount: number;
  /** Set the level on THIS conversation. Absent as long as no conversation exists
   *  (first message): there's then nothing to override, so the default receives it. */
  onApplyConversation?: (level: AppliedLevel) => LevelSnapshot;
  /** Set the level EVERYWHERE — the default, the one from Réglages → Confidentialité. */
  onApplyAlways: (level: AppliedLevel) => LevelSnapshot;
  /** Put a snapshot back — the undo. Read off the CURRENT api, never a stale one. */
  restore: (snap: LevelSnapshot) => void;
}

const NAV_KEYS = new Set(["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"]);

/**
 * The redaction level, FROM THE COMPOSER.
 *
 * It only used to live in the conversation's ⋯ menu and in Réglages: that is,
 * two actions away from the place where you notice a send is going to mask too much — or too little.
 * The decision is the same as elsewhere, it is just REACHABLE where it's made.
 *
 * ⚠️ **ONE click sets the level, and it sets it on THE CONVERSATION.** The composer acts on what
 * is in front of you: it's the least surprising scope from an input bar, and
 * the only one that undoes itself in three seconds (reopen, pick the other one). The global default
 * gets changed where it's weighed — Réglages → Confidentialité, or the ⋯ menu's "Par défaut" tab.
 * The ONLY exception, and it's forced: with no conversation (first message), there is nothing to
 * override, so the default receives it — otherwise the action would do nothing at all.
 * **The scope is SAID, in the menu, before the click**: a gesture whose reach one has to guess
 * is a gesture one believes shorter than it is — on the home screen it rewrites every future
 * thread, and nothing else on screen would say so.
 *
 * ⚠️ **The cards' text comes from `privacyLevelMeta`, never from here.** `short` is what the
 * level COVERS, `tradeoff` what it leaves readable or may distort — the counterpart rule 8
 * imposes, stated on the surface where one lowers the guard in passing. The USE (`desc`,
 * « pour la recherche web… ») stays in Réglages, where a level is WEIGHED: at the composer
 * one asks « what does this mask, what stays readable », and the sentence that said when
 * to pick it doubled the height of every card — the menu no longer fit above the composer.
 * Réglages' `PrivacyLevelPicker` renders the SAME sentences, in the same order. A level marked
 * `reduced` also wears the EYE, as in Réglages: a card that looked like the others would
 * assert a protection it removes. Writing the sentences in this file would be the
 * start of two vocabularies (rule 9).
 *
 * « Sur mesure » is a STATE, not a choice: shown checked when it applies (with the note
 * that a preset will replace the hand-set categories), never offered as a button.
 */
export function ComposerRedactMenu({
  api,
  onDone,
}: {
  api: RedactLevelApi;
  /** Close the menu — with what was applied, when a card was clicked. */
  onDone: (applied?: AppliedChange) => void;
}) {
  const t = useT();
  const groupRef = useRef<HTMLDivElement>(null);
  const scope: LevelScope = api.onApplyConversation ? "conversation" : "default";
  const apply = (level: AppliedLevel) => {
    const snap = (api.onApplyConversation ?? api.onApplyAlways)(level);
    onDone(snap ? { level, scope, snap } : undefined);
  };

  // A popover that opens without moving focus is invisible to the keyboard: land on the
  // card in force (or the first one), then arrows walk the scale — a roving tabindex.
  useEffect(() => {
    groupRef.current?.querySelector<HTMLElement>('button[role="radio"][tabindex="0"]')?.focus();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.has(e.key) || !groupRef.current) return;
    const items = [...groupRef.current.querySelectorAll<HTMLElement>('button[role="radio"]')];
    if (!items.length) return;
    const i = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
    const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : forward
            ? (i + 1) % items.length
            : (i - 1 + items.length) % items.length;
    e.preventDefault();
    items[next]?.focus();
  };

  const custom = api.level === "custom";
  return (
    <>
      <div className="cv-eyebrow crm-eyebrow">{t.composer.redactLevel}</div>
      <p className="crm-scope">
        {scope === "conversation" ? t.composer.scopeConversation : t.composer.scopeDefault}
      </p>
      <div
        ref={groupRef}
        className="crm-levels"
        role="radiogroup"
        aria-label={t.composer.redactLevel}
        onKeyDown={onKeyDown}
      >
        {custom && (
          <div className="crm-level custom" role="radio" aria-checked tabIndex={-1}>
            <span className="crm-level-ico">
              <LevelsIcon size={15} bars={api.bars} />
            </span>
            <span className="crm-level-body">
              <span className="crm-level-head">
                <span className="crm-level-name">{t.leaves.privacyLevels.custom}</span>
                <span className="crm-level-check" aria-label={t.composer.currentLevel}>
                  <CheckIcon size={14} />
                </span>
              </span>
              <span className="crm-level-desc">{t.leaves.privacyLevels.customNote}</span>
            </span>
          </div>
        )}
        {privacyLevelMeta(t).map((m, idx) => {
          const current = api.level === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={current}
              tabIndex={current || (custom && idx === 0) ? 0 : -1}
              className="crm-level"
              onClick={() => apply(m.id)}
            >
              {/* Each card carries ITS OWN level: the list reads like a scale. */}
              <span className="crm-level-ico">
                <LevelsIcon size={15} bars={levelBars(m.id)} />
              </span>
              <span className="crm-level-body">
                <span className="crm-level-head">
                  <span className="crm-level-name">{m.label}</span>
                  {m.reduced && (
                    <span className="crm-level-flag" role="img" aria-label={t.composer.reducedTip}>
                      <EyeIcon size={13} />
                    </span>
                  )}
                  {current && (
                    <span className="crm-level-check" aria-label={t.composer.currentLevel}>
                      <CheckIcon size={14} />
                    </span>
                  )}
                </span>
                {/* What the level COVERS — word for word the sentence Réglages'
                    `PrivacyLevelPicker` renders: one vocabulary, two doors. */}
                <span className="crm-level-desc">{m.short}</span>
                <span className="crm-level-tradeoff">{m.tradeoff}</span>
              </span>
            </button>
          );
        })}
      </div>
      {api.forcedCount > 0 && (
        <p className="crm-lock">
          <LockIcon size={12} />
          <span>{t.composer.forcedNote(api.forcedCount)}</span>
        </p>
      )}
    </>
  );
}
