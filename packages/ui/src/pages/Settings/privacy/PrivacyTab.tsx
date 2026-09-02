import { BRAND } from "@openmasq/branding";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useT } from "../../../i18n";
import { ChevDownIcon, ShieldIcon, Switch } from "../../../components/brand";
import { captureEvent } from "../../../analytics";
import { RedactionRulesContent } from "../../../containers/modals/redaction/RedactionRulesContent";
import type { Conversation, RedactCategoryKey, Settings } from "../../../types";
import { REDACT_CATEGORIES } from "../../../privacy/redactCategories";
import { PrivacyReport } from "./PrivacyReport";
import { PrivacyLevelPicker } from "../../../components/PrivacyLevelPicker";
import { activeCount, categoriesForLevel, levelOf, TOTAL_CATEGORIES } from "../../../privacy/privacyLevel";

/**
 * « Confidentialité » — the product's own subject, on its own page.
 *
 * It used to be three headings deep inside « Compte » (« Votre confidentialité »,
 * « Confidentialité & masquage », « Confidentialité »), between a sign-out button and a
 * developer toggle, with the seventeen-category matrix always unfolded. Here the page is
 * one decision (the level), then the proof (what has been protected), then the display
 * options — the matrix staying unfolded under the levels, as their detail.
 */
export function PrivacyTab({
  draft,
  setDraft,
  conversations,
  forcedCategories,
  onOpenAudit,
}: {
  draft: Settings;
  setDraft: Dispatch<SetStateAction<Settings>>;
  conversations: Conversation[];
  /** Category keys the organization mandates ON — forced active + locked. */
  forcedCategories?: string[];
  /** Open the detailed journal (its own tab). */
  onOpenAudit?: () => void;
}) {
  const t = useT();
  const level = levelOf(draft.redactCategories, forcedCategories);
  // UNFOLDED by default on this page. The levels' descriptions say what each one is
  // FOR ("perfect for the web"), plus what it checks: the matrix is therefore what
  // answers "and concretely?", including for the reduced level, where it shows the
  // five BETA boxes unchecked. Collapsible, but never the first screen of a privacy
  // choice. A conversation's rules modal keeps its own default.
  const [rulesOpen, setRulesOpen] = useState(true);
  // The « Options avancées » fold — closed: none of its toggles is the page's decision.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const forced = new Set(forcedCategories ?? []);
  const active = activeCount(draft.redactCategories, forcedCategories);

  return (
    <>
      <section className="settings-section">
        <div className="cv-eyebrow">{t.privacyTab.protectedEyebrow}</div>
        <PrivacyLevelPicker
          level={level}
          onPick={(id) => setDraft((d) => ({ ...d, redactCategories: categoriesForLevel(id) }))}
        />
        <div className="settings-card settings-rules-card">
          <button
            type="button"
            className="settings-rules-toggle"
            aria-expanded={rulesOpen}
            onClick={() => setRulesOpen((o) => !o)}
          >
            <span className="row-body">
              <span className="row-title">{t.privacyTab.perCategory}</span>
              <span className="row-desc">
                {t.privacyTab.activeCount(active, TOTAL_CATEGORIES)}
                {forced.size > 0 && t.privacyTab.managedByOrg(forced.size)}
              </span>
            </span>
            <span className={`settings-rules-chev${rulesOpen ? " on" : ""}`}>
              <ChevDownIcon size={16} />
            </span>
          </button>
          {rulesOpen && (
            <RedactionRulesContent
              isOn={(k) => !!draft.redactCategories[k]}
              setCat={(k: RedactCategoryKey, on: boolean) =>
                setDraft((d) => ({ ...d, redactCategories: { ...d.redactCategories, [k]: on } }))
              }
              forced={forced}
            />
          )}
        </div>
      </section>

      <PrivacyReport conversations={conversations} onOpenAudit={onOpenAudit} />

      {/* « Options avancées » — ONE fold, CLOSED by default, for the toggles most
          accounts never touch. Each row keeps its one-line hint; the long explanation
          is the Guide's job. Two of them are neighbours on purpose: one changes what
          YOU see (token display), the other what LEAVES (wire tokens) — merging them
          would pass off a privacy choice paid for in reply quality as a display
          preference. The technical log is a trust argument (the exact message the model
          received), not a developer tool, hence its place here rather than in Compte.
          The Mémoire's SILENT extraction sits here too: "does this send more of my data
          out?" is exactly the question an auto-extraction switch raises, so its hint
          keeps the guarantee — nothing new leaves the machine, and the explicit
          « retiens que… » is its own consent. To add a row: one more `.toggle-row`
          in the list below. */}
      <section className="settings-section">
        <div className="settings-card settings-rules-card">
          <button
            type="button"
            className="settings-rules-toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            <span className="row-body">
              <span className="row-title">{t.privacyTab.advancedTitle}</span>
              <span className="row-desc">{t.privacyTab.advancedSub}</span>
            </span>
            <span className={`settings-rules-chev${advancedOpen ? " on" : ""}`}>
              <ChevDownIcon size={16} />
            </span>
          </button>
          {advancedOpen && (
            <>
              <div className="toggle-row">
                <div className="row-body">
                  <div className="row-title">{t.privacyTab.debugLogTitle}</div>
                  <div className="row-desc">{t.privacyTab.debugLogHint}</div>
                </div>
                <Switch
                  checked={!!draft.debugLog}
                  onChange={(v) => {
                    captureEvent({ name: "debug_mode_toggle", on: v });
                    setDraft((d) => ({ ...d, debugLog: v }));
                  }}
                />
              </div>
              <div className="toggle-row">
                <span className="row-icon tone-coral">
                  <ShieldIcon size={16} />
                </span>
                <div className="row-body">
                  <div className="row-title">{t.privacyTab.tokenDisplayTitle}</div>
                  <div className="row-desc">{t.privacyTab.tokenDisplayHint}</div>
                </div>
                <Switch
                  checked={!!draft.redactTokenDisplay}
                  onChange={(v) => setDraft((d) => ({ ...d, redactTokenDisplay: v }))}
                />
              </div>
              <div className="toggle-row">
                <span className="row-icon tone-coral">
                  <ShieldIcon size={16} />
                </span>
                <div className="row-body">
                  <div className="row-title">{t.privacyTab.wireTokensTitle}</div>
                  <div className="row-desc">{t.privacyTab.wireTokensHint}</div>
                </div>
                <Switch
                  checked={!!draft.redactWireTokens}
                  onChange={(v) => setDraft((d) => ({ ...d, redactWireTokens: v }))}
                />
              </div>
              <div className="toggle-row">
                <div className="row-body">
                  <div className="row-title">{t.privacyTab.memoryAutoTitle}</div>
                  <div className="row-desc">{t.privacyTab.memoryAutoHint(BRAND.name)}</div>
                </div>
                <Switch
                  checked={draft.memoryAuto === true}
                  onChange={(v) => setDraft((d) => ({ ...d, memoryAuto: v }))}
                />
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

/** Re-exported so the rules count stays one number for whoever imports it. */
export const RULES_TOTAL = REDACT_CATEGORIES.length;
