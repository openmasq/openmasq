import { CheckIcon, LevelsIcon } from "../../components/brand";
import { levelBars, privacyLevelMeta, type PrivacyLevel } from "../../privacy/privacyLevel";
import { useT } from "../../i18n";

export type AppliedLevel = Exclude<PrivacyLevel, "custom">;

export interface RedactLevelApi {
  /** The EFFECTIVE level of the open conversation (override ⊕ global), or the global
   *  default when no conversation exists yet. */
  level: PrivacyLevel;
  /** How many bars the button's glyph carries — `levelBars` of the current level. */
  bars: 1 | 2 | 3;
  /** Set the level on THIS conversation. Absent as long as no conversation exists
   *  (first message): there's then nothing to override, so the default receives it. */
  onApplyConversation?: (level: AppliedLevel) => void;
  /** Set the level EVERYWHERE — the default, the one from Réglages → Confidentialité. */
  onApplyAlways: (level: AppliedLevel) => void;
}

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
 *
 * ⚠️ **The cards' text comes from `privacyLevelMeta` (`short`), never from here.** It's the
 * SHORT register of the same vocabulary — what the level COVERS. Réglages keeps the
 * long register (`desc` + the counterpart rule 8 imposes), because that's where the
 * decision gets made with full knowledge; here it gets changed in passing, and you always
 * return to the same place to weigh it. Writing the sentences in this file would be the
 * start of two vocabularies (rule 9).
 */
export function ComposerRedactMenu({
  api,
  onDone,
}: {
  api: RedactLevelApi;
  /** Close the menu — called after applying. */
  onDone: () => void;
}) {
  const t = useT();
  const apply = (level: AppliedLevel) => {
    (api.onApplyConversation ?? api.onApplyAlways)(level);
    onDone();
  };

  return (
    <>
      <div className="cv-eyebrow crm-eyebrow">{t.composer.redactLevel}</div>
      <div className="crm-levels" role="radiogroup" aria-label={t.composer.redactLevel}>
        {privacyLevelMeta(t).map((m) => {
          const current = api.level === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={current}
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
                  {current && (
                    <span className="crm-level-check" aria-label={t.composer.currentLevel}>
                      <CheckIcon size={14} />
                    </span>
                  )}
                </span>
                <span className="crm-level-desc">{m.short}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
