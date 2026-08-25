import { useState } from "react";
import { ModalShell } from "../ModalShell";
import { CheckIcon, Switch } from "../../../components/brand";
import { RedactionRulesContent } from "./RedactionRulesContent";
import { PrivacyLevelPicker } from "../../../components/PrivacyLevelPicker";
import { categoriesForLevel, levelOf } from "../../../privacy/privacyLevel";
import type { Conversation, RedactCategoryKey, Settings } from "../../../types";
import { BRAND } from "@openmasq/branding";

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
  /** « Sans mémoire dans cette conversation » — coupe l'injection, l'outil de recherche
   *  en mémoire et l'extraction silencieuse pour CE fil (un « retiens que… » explicite
   *  reste honoré). Absent ⇒ le rang ne se rend pas (préversion sans mémoire). */
  onMemoryOff?: (off: boolean) => void;
  /** Category keys the organization mandates ON — forced active + locked (a
   *  member can't disable them). Rendered with a 🔒 "Organisation" tag. */
  forcedCategories?: string[];
}) {
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
        <div className="cv-eyebrow rrm-eyebrow">REDACTION</div>
        <h2 className="cv-display rrm-title">
          Règles de <span className="rrm-hl">redaction</span>
        </h2>
        <p className="rrm-sub">
          Les catégories activées sont retirées de vos messages avant qu'un modèle ne les voie.
        </p>
      </div>

      {perConv && (
        <div className="rrm-tabs">
          <button className={onConvTab ? "on" : ""} onClick={() => setTab("conversation")}>
            Cette conversation
          </button>
          <button className={!onConvTab ? "on" : ""} onClick={() => setTab("default")}>
            Par défaut
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
        {/* La MÉMOIRE par conversation — dans la modale des règles parce que c'est la
            même question (« qu'est-ce qui accompagne mes envois d'ici ? ») et le même
            périmètre (ce fil). Onglet conversation uniquement : le réglage global de la
            mémoire vit sur sa page. */}
        {onConvTab && onMemoryOff && (
          <label className="rrm-memory-row">
            <Switch
              checked={!conversation?.memoryOff}
              onChange={(on) => onMemoryOff(!on)}
            />
            <span className="rrm-memory-text">
              <strong>Mémoire dans cette conversation</strong>
              <span>
                Coupée : rien de votre mémoire n'accompagne les envois d'ici, le modèle ne
                peut pas la consulter, et {BRAND.name} n'y note rien de lui-même. « Retiens
                que… » reste possible — c'est votre demande.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="confirm-footer">
        <button className="btn-primary btn-inline" onClick={onClose}>
          <CheckIcon size={15} /> Terminé
        </button>
      </div>
    </ModalShell>
  );
}
