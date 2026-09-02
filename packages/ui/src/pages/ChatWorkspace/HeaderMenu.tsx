import { ShieldIcon, ActivityIcon, EyeIcon, TrashIcon } from "../../components/brand";
import type { Settings } from "../../types";
import { useT } from "../../i18n";
import { privacyLevelLabel } from "../../privacy/privacyLevel";
import type { RedactLevelApi } from "./ComposerRedactMenu";

/**
 * The chat top bar's ⋯ dropdown — extracted from `ChatHeader` (rule 1). Pure
 * presentation: every action is a callback the header owns (it keeps the modal
 * state and the outside-click/Escape closing logic on its `menu-anchor`).
 */
export function HeaderMenu({
  protectedCount,
  redactLevel,
  settings,
  onOpenRules,
  onOpenTransparency,
  onOpenDebug,
  onAskDelete,
}: {
  protectedCount: number;
  /** The level in force here — the entry names it, and tags a thread that deviates
   *  from the default. Absent (no settings) ⇒ the count alone. */
  redactLevel?: RedactLevelApi;
  settings?: Settings;
  onOpenRules: () => void;
  /** The side-by-side comparison. Always offered: the banner announcing it only shows
   *  once, so this is where the evidence stays reachable afterward. */
  onOpenTransparency: () => void;
  onOpenDebug: () => void;
  onAskDelete?: () => void;
}) {
  const t = useT();
  return (
    <div className="header-menu">
      {/* The kit moved the toolbar's standalone shield pill in here: the count is a
          STATUS, not an action you reach for, and the toolbar reads cleaner without
          it. Same target as the old pill — the per-conversation redaction rules, which
          now lead with the SAME three levels as Réglages → Confidentialité. The LEVEL
          is named too: a count of values says nothing about how this thread masks, and
          « modifié » is the only place outside the modal that says it deviates. */}
      <button className="header-menu-item" onClick={onOpenRules}>
        <ShieldIcon size={15} />
        {t.chat.redactionSummary(
          protectedCount,
          redactLevel && privacyLevelLabel(t, redactLevel.level),
        )}
        {redactLevel?.overridden && (
          <span className="rrm-tag ml-auto">{t.redactionCatalog.modified}</span>
        )}
      </button>
      <button className="header-menu-item" onClick={onOpenTransparency}>
        <EyeIcon size={15} />
        {t.chat.seeWhatTheModelSaw}
      </button>
      {/* The TOGGLE is the gate (Réglages → Confidentialité → « Journal technique
          détaillé »): turning it on is the deliberate act, and the log only holds
          data this renderer already has. The former « compte interne » condition
          (team email) protected nothing by design — and ended up blocking
          the team itself on staging, signed in with a different account. A setting
          that captures with NO surface to read it would be worse than no setting. */}
      {settings?.debugLog && (
        <button className="header-menu-item" onClick={onOpenDebug}>
          <ActivityIcon size={15} />
          {t.chat.debugLog}
        </button>
      )}
      {onAskDelete && (
        <button className="header-menu-item danger" onClick={onAskDelete}>
          <TrashIcon size={15} />
          {t.chrome.deleteConversationAction}
        </button>
      )}
    </div>
  );
}
