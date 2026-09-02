import { ModalShell } from "../ModalShell";
import { CheckIcon, Switch } from "../../../components/brand";
import { RedactionRulesContent } from "./RedactionRulesContent";
import type { Conversation, RedactCategoryKey, Settings } from "../../../types";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../../i18n";
/* The redaction rules of ONE conversation: a sparse per-chat override of the categories
   (inheriting the global default for untouched ones) + the thread's memory switch.

   ⚠️ No level picker and no « Par défaut » tab here, on purpose. The LEVEL of a
   conversation is chosen in ONE place — the composer's button (`ComposerRedactMenu`) —
   and the global default where it is weighed, Réglages → Confidentialité; this modal
   only LINKS there. Three doors to the same setting taught users to look for it in the
   wrong one, and a « Par défaut » tab mirroring Réglages was a second screen to keep in
   sync (rule 9). Without a conversation (a caller with no per-chat scope) the chips
   edit the global settings — the legacy fallback, never offered as a tab. */

export function RedactionRulesModal({
  settings,
  onChange,
  onClose,
  conversation,
  onChangeConversation,
  onOpenPrivacySettings,
  onMemoryOff,
  forcedCategories,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  conversation?: Conversation | null;
  onChangeConversation?: (cats: Conversation["redactCategories"]) => void;
  /** Navigate to Réglages → Confidentialité (the default level and matrix). Absent
   *  (no shell) ⇒ the link isn't drawn. */
  onOpenPrivacySettings?: () => void;
  /** « Sans mémoire dans cette conversation » — cuts the injection, the memory
   *  search tool, and the silent extraction for THIS thread (an explicit « retiens que… »
   *  is still honoured). Absent ⇒ the row isn't rendered (memory-less pre-release). */
  onMemoryOff?: (off: boolean) => void;
  /** Category keys the organization mandates ON — forced active + locked (a
   *  member can't disable them). Rendered with a 🔒 "Organisation" tag. */
  forcedCategories?: string[];
}) {
  const t = useT();
  const forced = new Set(forcedCategories ?? []);
  const perConv = !!(conversation && onChangeConversation);

  const override = conversation?.redactCategories ?? {};
  const global = settings.redactCategories;
  // Effective state shown for the conversation = global ⊕ override.
  const isOn = (k: RedactCategoryKey) => !!(perConv ? (override[k] ?? global[k]) : global[k]);

  const setCat = (k: RedactCategoryKey, on: boolean) => {
    if (perConv) onChangeConversation!({ ...override, [k]: on });
    else onChange({ ...settings, redactCategories: { ...global, [k]: on } });
  };

  const hasOverride = Object.keys(override).length > 0;

  return (
    <ModalShell onClose={onClose} width="580px" maxHeight="86vh">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">{t.modals.redactionRules.eyebrow}</div>
        <h2 className="cv-display rrm-title">
          {t.modals.redactionRules.titleLead}<span className="rrm-hl">{t.modals.redactionRules.titleHighlight}</span>
        </h2>
        <p className="rrm-sub">
          {t.modals.redactionRules.sub}
        </p>
        {/* The way to the DEFAULT — a link, not a tab: the default is edited where it
            is weighed, and this modal never mirrors that screen. */}
        {onOpenPrivacySettings && (
          <button type="button" className="rrm-link" onClick={onOpenPrivacySettings}>
            {t.modals.redactionRules.defaultLevelLink}
          </button>
        )}
      </div>

      <div className="rrm-body">
        <RedactionRulesContent
          isOn={isOn}
          setCat={setCat}
          forced={forced}
          isOverridden={(k) => perConv && k in override}
          onReset={perConv && hasOverride ? () => onChangeConversation!({}) : undefined}
        />
        {/* Per-conversation MEMORY — in the rules modal because it's the
            same question (« qu'est-ce qui accompagne mes envois d'ici ? ») and the same
            scope (this thread). The global memory setting lives on its own page. */}
        {perConv && onMemoryOff && (
          <label className="rrm-memory-row">
            <Switch
              checked={!conversation?.memoryOff}
              onChange={(on) => onMemoryOff(!on)}
            />
            <span className="rrm-memory-text">
              <strong>{t.modals.redactionRules.memoryTitle}</strong>
              <span>
                {t.modals.redactionRules.memoryDesc(BRAND.name)}
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="confirm-footer">
        <button className="btn-primary btn-inline" onClick={onClose}>
          <CheckIcon size={15} /> {t.modals.redactionRules.done}
        </button>
      </div>
    </ModalShell>
  );
}
