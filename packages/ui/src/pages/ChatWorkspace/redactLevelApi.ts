import {
  categoriesForLevel,
  levelBars,
  levelOf,
  type PrivacyLevel,
} from "../../privacy/privacyLevel";
import { CATEGORY_DEFAULTS } from "../../privacy/redactCategories";
import type { LevelSnapshot, RedactLevelApi } from "./ComposerRedactMenu";
import type { Conversation, RedactCategoryKey, Settings } from "../../types";

/**
 * What the composer's « niveau » button can read and write — PURE, so testable without
 * mounting a screen, and out of `ChatView` (already in size debt).
 *
 * ⚠️ The TWO writes are the same ones as the rules modal, not new ones: the
 * « cette conversation » scope writes the thread's override, « toujours » writes the
 * settings. A second application path would have ended up diverging from the ⋯ menu's
 * and Réglages → Confidentialité's — "applying a level" means nothing more here (rule 9).
 *
 * Each write RETURNS a snapshot of what it replaced, and `restore` takes one back: that
 * is the « Annuler » of the confirmation pill. The snapshot carries the conversation id, so
 * undoing after a tab switch still targets the thread that was changed — and `restore`
 * is read off the CURRENT api at click time, so the settings it spreads are the live ones.
 *
 * The level SHOWN is the open conversation's effective one (global ⊕ override), with the
 * categories mandated by the organization EXCLUDED from the comparison: they are active no
 * matter what, and counting them would show « Sur mesure » to a member who touched nothing.
 */
export function buildRedactLevelApi(input: {
  settings?: Settings;
  onChangeSettings?: (s: Settings) => void;
  conversation?: Conversation | null;
  onChangeConversation?: (id: string, cats: Conversation["redactCategories"]) => void;
  forcedCategories?: string[];
}): RedactLevelApi | undefined {
  const { settings, onChangeSettings, conversation, onChangeConversation, forcedCategories } =
    input;
  if (!settings || !onChangeSettings) return undefined;
  const level = levelOf(
    { ...settings.redactCategories, ...(conversation?.redactCategories ?? {}) },
    forcedCategories,
  );
  return {
    level,
    // The button's glyph carries the CURRENT level — `levelBars` knows that a « Sur mesure »
    // claims no tier and is derived from what is actually active.
    bars: levelBars(level, settings.redactCategories, forcedCategories),
    overridden: hasEffectiveOverride(settings.redactCategories, conversation?.redactCategories),
    forcedCount: forcedCategories?.length ?? 0,
    // The click sets the level on THE CONVERSATION — the least surprising scope from
    // an input bar. Without a conversation (first message) there is nothing to override:
    // the default then receives it, otherwise the gesture would do nothing at all.
    onApplyConversation:
      conversation && onChangeConversation
        ? (l: Exclude<PrivacyLevel, "custom">) => {
            const snap: LevelSnapshot = {
              scope: "conversation",
              convId: conversation.id,
              cats: conversation.redactCategories,
            };
            onChangeConversation(
              conversation.id,
              categoriesForLevel(l) as Conversation["redactCategories"],
            );
            return snap;
          }
        : undefined,
    onApplyAlways: (l: Exclude<PrivacyLevel, "custom">) => {
      const snap: LevelSnapshot = { scope: "default", cats: settings.redactCategories };
      onChangeSettings({ ...settings, redactCategories: categoriesForLevel(l) });
      return snap;
    },
    restore: (snap) => {
      if (snap.scope === "conversation") onChangeConversation?.(snap.convId, snap.cats ?? {});
      else onChangeSettings({ ...settings, redactCategories: snap.cats });
    },
  };
}

/**
 * Does the conversation's sparse override CHANGE anything against the default? An override
 * that only restates the default (the modal writes one key at a time, and a toggle can go
 * back) is not a deviation — tagging it « modifié » would blame a thread that masks exactly
 * like every other one.
 */
export function hasEffectiveOverride(
  global: Settings["redactCategories"] | undefined,
  override: Conversation["redactCategories"] | undefined,
): boolean {
  if (!override) return false;
  const on = (m: Partial<Record<RedactCategoryKey, boolean>> | undefined, k: RedactCategoryKey) =>
    (m?.[k] ?? CATEGORY_DEFAULTS[k]) !== false;
  return (Object.keys(override) as RedactCategoryKey[]).some(
    (k) => override[k] !== undefined && on(override, k) !== on(global, k),
  );
}
