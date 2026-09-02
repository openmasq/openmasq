import { useState } from "react";
import { ModalShell } from "../ModalShell";
import { CheckIcon, Switch } from "../../../components/brand";
import { RedactionRulesContent } from "./RedactionRulesContent";
import { PrivacyLevelPicker } from "../../../components/PrivacyLevelPicker";
import { categoriesForLevel, levelOf } from "../../../privacy/privacyLevel";
import type { Conversation, RedactCategoryKey, Settings } from "../../../types";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../../i18n";
/* Redaction rules. Two scopes when a conversation is given: "Cette conversation" edits a
   sparse per-chat override (inherits the global default for untouched categories);
   "Par défaut" edits the global settings.

   It leads with the SAME three levels as Réglages → Confidentialité, from the same source
   (`privacy/privacyLevel.ts`) — a user who set « Navigation » there and opens this from a
   conversation must see the vocabulary they already know, and picking a level here must
   mean exactly what it means there. The seventeen switches stay underneath for whoever
   wants them, which is also how the settings page is arranged. Two ways to say it would
   be two things to keep in sync (rule 9), so neither the labels nor the category maps are
   re-declared here. */

export function RedactionRulesModal({
  settings,
  onChange,
  onClose,
  conversation,
  onChangeConversation,
  onMemoryOff,
  forcedCategories,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  conversation?: Conversation | null;
  onChangeConversation?: (cats: Conversation["redactCategories"]) => void;
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
  const [tab, setTab] = useState<"conversation" | "default">(
    perConv ? "conversation" : "default",
  );
  const onConvTab = perConv && tab === "conversation";

  const override = conversation?.redactCategories ?? {};
  const global = settings.redactCategories;
  // Effective state shown on the conversation tab = global ⊕ override.
  const isOn = (k: RedactCategoryKey) =>
    !!(onConvTab ? (override[k] ?? global[k]) : global[k]);

  const setCat = (k: RedactCategoryKey, on: boolean) => {
    if (onConvTab) onChangeConversation!({ ...override, [k]: on });
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
      </div>

      {perConv && (
        <div className="rrm-tabs">
          <button className={onConvTab ? "on" : ""} onClick={() => setTab("conversation")}>
            {t.modals.redactionRules.thisConversation}
          </button>
          <button className={!onConvTab ? "on" : ""} onClick={() => setTab("default")}>
            {t.modals.redactionRules.byDefault}
          </button>
        </div>
      )}

      <div className="rrm-body">
        {/* The level applies to the OPEN scope: on the conversation tab it writes that
            conversation's override, on « Par défaut » the global settings — so the picker
            never silently edits the other one. */}
        <PrivacyLevelPicker
          level={levelOf(
            onConvTab ? ({ ...global, ...override } as Settings["redactCategories"]) : global,
            forcedCategories,
          )}
          onPick={(id) => {
            const cats = categoriesForLevel(id);
            if (onConvTab) onChangeConversation!(cats as Conversation["redactCategories"]);
            else onChange({ ...settings, redactCategories: cats });
          }}
        />
        <RedactionRulesContent
          isOn={isOn}
          setCat={setCat}
          forced={forced}
          isOverridden={(k) => onConvTab && k in override}
          onReset={onConvTab && hasOverride ? () => onChangeConversation!({}) : undefined}
        />
        {/* Per-conversation MEMORY — in the rules modal because it's the
            same question (« qu'est-ce qui accompagne mes envois d'ici ? ») and the same
            scope (this thread). Conversation tab only: the global memory setting
            lives on its own page. */}
        {onConvTab && onMemoryOff && (
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
