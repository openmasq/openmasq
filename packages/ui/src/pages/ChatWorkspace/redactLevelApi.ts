import { categoriesForLevel, levelBars, levelOf, type PrivacyLevel } from "../../privacy/privacyLevel";
import type { RedactLevelApi } from "./ComposerRedactMenu";
import type { Conversation, Settings } from "../../types";

/**
 * What the composer's « niveau » button can read and write — PURE, so testable without
 * mounting a screen, and out of `ChatView` (already in size debt).
 *
 * ⚠️ The TWO writes are the same ones as the rules modal, not new ones: the
 * « cette conversation » scope writes the thread's override, « toujours » writes the
 * settings. A second application path would have ended up diverging from the ⋯ menu's
 * and Réglages → Confidentialité's — "applying a level" means nothing more here (rule 9).
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
  const { settings, onChangeSettings, conversation, onChangeConversation, forcedCategories } = input;
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
    // The click sets the level on THE CONVERSATION — the least surprising scope from
    // an input bar. Without a conversation (first message) there is nothing to override:
    // the default then receives it, otherwise the gesture would do nothing at all.
    onApplyConversation:
      conversation && onChangeConversation
        ? (l: Exclude<PrivacyLevel, "custom">) =>
            onChangeConversation(conversation.id, categoriesForLevel(l) as Conversation["redactCategories"])
        : undefined,
    onApplyAlways: (l: Exclude<PrivacyLevel, "custom">) =>
      onChangeSettings({ ...settings, redactCategories: categoriesForLevel(l) }),
  };
}
