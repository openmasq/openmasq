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
 * « Confidentialité & redaction », « Confidentialité »), between a sign-out button and a
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

      <section className="settings-section">
        {/* TRANSPARENCY — moved out of « Développeur » (audit of 27/07). The setting
            described "the exact message received by the model": that's a trust
            argument, not a debugging tool, and it had no business being in a
            section nobody opens. What it activates remains the technical LOG;
            the side-by-side comparison, meanwhile, is always available with nothing to
            activate (⋯ menu → « Voir ce que le modèle a vu »). */}
        <div className="cv-eyebrow">{t.privacyTab.transparencyEyebrow}</div>
        <div className="settings-card">
          <div className="toggle-row">
            <div className="row-body">
              <div className="row-title">{t.privacyTab.debugLogTitle}</div>
              <div className="row-desc">
                {t.privacyTab.debugLogHint}
              </div>
            </div>
            <Switch
              checked={!!draft.debugLog}
              onChange={(v) => {
                captureEvent({ name: "debug_mode_toggle", on: v });
                setDraft((d) => ({ ...d, debugLog: v }));
              }}
            />
          </div>
        </div>
      </section>

      {/* TWO neighboring settings, and it's deliberate: one changes what YOU see, the other
          what LEAVES. Merging them into one checkbox would pass off a privacy choice —
          one paid for in reply quality — as a display preference. */}
      <section className="settings-section">
        <div className="cv-eyebrow">{t.privacyTab.displayEyebrow}</div>
        <div className="settings-card">
          <div className="toggle-row">
            <span className="row-icon tone-coral">
              <ShieldIcon size={16} />
            </span>
            <div className="row-body">
              <div className="row-title">{t.privacyTab.tokenDisplayTitle}</div>
              {/* One line. The five-line version of this text is the Guide's job. */}
              <div className="row-desc">
                {t.privacyTab.tokenDisplayHint}
              </div>
            </div>
            <Switch
              checked={!!draft.redactTokenDisplay}
              onChange={(v) => setDraft((d) => ({ ...d, redactTokenDisplay: v }))}
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="cv-eyebrow">{t.privacyTab.wireEyebrow}</div>
        <div className="settings-card">
          <div className="toggle-row">
            <span className="row-icon tone-coral">
              <ShieldIcon size={16} />
            </span>
            <div className="row-body">
              <div className="row-title">{t.privacyTab.wireTokensTitle}</div>
              <div className="row-desc">
                {t.privacyTab.wireTokensHint}
              </div>
            </div>
            <Switch
              checked={!!draft.redactWireTokens}
              onChange={(v) => setDraft((d) => ({ ...d, redactWireTokens: v }))}
            />
          </div>
        </div>
      </section>
    </>
  );
}

/** Re-exported so the rules count stays one number for whoever imports it. */
export const RULES_TOTAL = REDACT_CATEGORIES.length;
