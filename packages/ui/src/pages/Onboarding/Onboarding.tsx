import { BRAND } from "@openmasq/branding";
import { useRef, useState } from "react";
import type { Settings } from "../../types";
import { ArrowRightIcon, ChevLeftIcon } from "../../components/brand";
import { captureEvent } from "../../analytics";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { RedactionRulesContent } from "../../containers/modals/redaction/RedactionRulesContent";
import { useT } from "../../i18n";
import { RedactionDemo } from "../../components/RedactionDemo";
import { KeyChoice } from "./KeyChoice";
import { useAgentOptIns } from "../../hooks/useAgentOptIns";
import { platformAccessServed, subscriptionsSold } from "../../send/platformAccess";

/* redact — first-run onboarding.
   THREE steps: what the app does (shown, not configured), how you reach the models (the
   app's account vs your own key — the ONE genuine first-run choice, optional and
   skippable: the free model works with no action), and you're ready. It used to be a
   single screen of every redaction-category toggle (`privacy/privacyLevel.ts`
   `TOTAL_CATEGORIES`, read from the catalogue) — a settings pane wearing a welcome hat,
   which spent the whole of first-run attention on the one thing that already works by
   default. The « six endroits » tour of the sections is gone too: one line per place on
   a second page got skipped, and « Aide » already tells the same story when one looks.
   The rules did not move OUT of reach: « Régler finement » swaps this same card to the
   very same `RedactionRulesContent` the Réglages pane uses, and it stays there for ever
   after. Choices still write into the real Settings live; "Commencer" (or "Passer")
   marks onboarding complete. The analytics step id is the 1-based screen number
   (`skip:1` … `skip:3`), so the renumbering shifts the access/ready ids by one. */

/* The accent is the redaction palette's SKY hue, reached the way every marked surface
   reaches it: the `.hl-<hue>` class, then `--mk` / `--mk-ink` in the stylesheet. It was a
   frozen `#FF8FA3` — the pink — which root rule 12 forbids for exactly the reason it bit
   here: the highlight painted a background but left the text on `--text-strong`, so in the
   dark themes near-white ink sat on a light pastel. Naming the hue instead lets the ink
   invert with it. */

const STEPS = 3;

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  /** Dismiss the onboarding (marks it complete in the parent). */
  onDone: () => void;
  /** Save a provider key (→ `host.keys.set`, write-only). Absent (preview / no
   *  keychain) ⇒ the key form of the « Accès aux modèles » step is not rendered. */
  onSaveKey?: (provider: string, key: string) => Promise<void>;
  /** Which provider ids already hold a key (never a value — write-only store). */
  keyConfigured?: ReadonlySet<string>;
  /** OAuth PKCE for OpenRouter (`host.keys.connectOpenRouter`). Absent ⇒ paste only. */
  onConnectOpenRouter?: () => Promise<boolean>;
}

export function Onboarding({ settings, onChange, onDone, onSaveKey, onConnectOpenRouter, keyConfigured }: Props) {
  const t = useT();
  // Does THIS build have a hosted service (gateway + accounts)? It decides what this
  // journey can PROMISE — `send/platformAccess.ts`.
  const served = platformAccessServed();
  const [step, setStep] = useState(0);
  const [rules, setRules] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef);
  // The subscription CLIs this build can offer — the SAME list as Réglages → Modèles, so
  // the step never promises an agent the settings would not draw.
  const agents = useAgentOptIns({
    claudeCliEnabled: settings.claudeCliEnabled,
    onClaudeCliEnabled: (on) => onChange({ ...settings, claudeCliEnabled: on }),
    codexCliEnabled: settings.codexCliEnabled,
    onCodexCliEnabled: (on) => onChange({ ...settings, codexCliEnabled: on }),
    antigravityCliEnabled: settings.antigravityCliEnabled,
    onAntigravityCliEnabled: (on) => onChange({ ...settings, antigravityCliEnabled: on }),
  });

  function finish() {
    captureEvent({ name: "onboarding", step: "done" });
    onChange({ ...settings, onboarded: true });
  }
  /* « Passer » is measured TOO, and with the screen it was clicked from: without that, the
     one journey worth understanding — the one that abandons — is invisible, and
     "done" alone would suggest everyone makes it to the end. */
  function skip() {
    captureEvent({ name: "onboarding", step: rules ? "skip:regler" : `skip:${step + 1}` });
    onDone();
  }

  return (
    <div className="auth-scrim" role="dialog" aria-modal="true">
      <span className="om-aurora" aria-hidden="true" />
      <div className="ob-card" ref={cardRef} tabIndex={-1}>
        <div className="ob-word">
          {BRAND.name.split("").map((ch, i) => (
            <span key={i} className="cv-display ob-word-ch">
              {ch}
            </span>
          ))}
        </div>

        {!rules && (
          <div className="ob-progress" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <div key={i} className="ob-progress-track">
                {/* runtime-computed width → inline (rule 6's data exception); the colour
                    is NOT data, so it stays in the stylesheet via the hue class. */}
                <div
                  className="ob-progress-fill hl-sky"
                  style={{ width: i <= step ? "100%" : "0%" }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="ob-body">
          <div className="ob-body-inner">
            {rules ? (
              <>
                <div className="cv-eyebrow ob-eyebrow">{t.onboarding.tune.eyebrow}</div>
                <h1 className="cv-display ob-title">{t.onboarding.tune.title}</h1>
                <p className="ob-sub">{t.onboarding.tune.sub}</p>
                <RedactionRulesContent
                  isOn={(k) => !!settings.redactCategories[k]}
                  setCat={(k, on) =>
                    onChange({
                      ...settings,
                      redactCategories: { ...settings.redactCategories, [k]: on },
                    })
                  }
                />
              </>
            ) : step === 0 ? (
              <>
                <div className="cv-eyebrow ob-eyebrow">{t.onboarding.redaction.eyebrow}</div>
                <h1 className="cv-display ob-title">
                  {t.onboarding.redaction.titleLead}{" "}
                  <span className="ob-title-hl hl-sky">{t.onboarding.redaction.titleHighlight}</span>
                </h1>
                <p className="ob-sub">{t.onboarding.redaction.sub(BRAND.name)}</p>
                <RedactionDemo />
                {/* What the FIRST screen owes the reader, because it is what stops them
                    reaching for a « mode navigation » the moment a search misfires. Both
                    claims are true of the engine and pinned by `demo.test.ts`: the
                    notoriety filter never masks famous people, major brands or countries
                    (`@openmasq/redact` `notorious.ts`), and `WebNavRedactOffer` asks
                    before a web call would carry something masked. Said here, once, rather
                    than as a caveat on a settings card nobody reads at pick time. */}
                <ul className="ob-ready ob-behaviour">
                  <li>
                    {t.onboarding.redaction.notoriety.lead}
                    <strong>{t.onboarding.redaction.notoriety.strong}</strong>
                    {t.onboarding.redaction.notoriety.tail}
                  </li>
                  <li>
                    {t.onboarding.redaction.webReveal.lead(BRAND.name)}
                    <strong>{t.onboarding.redaction.webReveal.strong}</strong>
                    {t.onboarding.redaction.webReveal.tail}
                  </li>
                </ul>
              </>
            ) : step === 1 ? (
              <>
                <div className="cv-eyebrow ob-eyebrow">{t.onboarding.access.eyebrow}</div>
                {/* Without a hosted service (`send/platformAccess.ts`), there is no account
                    to offer; with one, but nothing to SELL (the default), the choice is
                    "your account or your key" — never a subscription that doesn't exist. */}
                <h1 className="cv-display ob-title">
                  {!served
                    ? t.onboarding.access.titleUnserved
                    : subscriptionsSold()
                      ? t.onboarding.access.titleServed
                      : t.onboarding.access.titleIncluded}
                </h1>
                <p className="ob-sub">
                  {served ? t.onboarding.access.subServed : t.onboarding.access.subUnserved}
                </p>
                <KeyChoice
                  // `?? null`: nothing is checked until something has been chosen.
                  mode={settings.billingMode ?? null}
                  onMode={(m) => onChange({ ...settings, billingMode: m })}
                  onSaveKey={onSaveKey}
                  onConnectOpenRouter={onConnectOpenRouter}
                  keyConfigured={keyConfigured ?? new Set()}
                  agents={agents}
                />
              </>
            ) : (
              <>
                <div className="cv-eyebrow ob-eyebrow">{t.onboarding.ready.eyebrow}</div>
                <h1 className="cv-display ob-title">{t.onboarding.ready.title}</h1>
                {/* What the previous step leaves in suspense: redaction depends on
                    NEITHER of the two access paths, and « Passer » cuts nothing off. The
                    second sentence is what makes the first verifiable — a free model is
                    selected by default (`prompt/models.ts` DEFAULT_MODEL_ID), so a fresh
                    install writes with no key and no subscription. */}
                <p className="ob-sub">
                  {/* Without a hosted service, no model is reachable until an access path
                      is wired up: say so, rather than promise a model that's ready. */}
                  {served
                    ? t.onboarding.ready.subServed(BRAND.name)
                    : t.onboarding.ready.subUnserved}
                </p>
                <ul className="ob-ready">
                  <li>{t.onboarding.ready.modelHint}</li>
                  <li>
                    {t.onboarding.ready.slashHint.lead}
                    <strong>{t.onboarding.ready.slashHint.strong}</strong>
                    {t.onboarding.ready.slashHint.tail}
                  </li>
                  <li>
                    {t.onboarding.ready.helpHint.lead}
                    <strong>{t.onboarding.ready.helpHint.strong}</strong>
                    {t.onboarding.ready.helpHint.tail}
                  </li>
                </ul>
                <button type="button" className="ob-tune" onClick={() => setRules(true)}>
                  {t.onboarding.ready.tuneRedaction}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="ob-footer">
          {rules ? (
            <button onClick={() => setRules(false)} className="ob-skip">
              <ChevLeftIcon size={16} /> {t.onboarding.back}
            </button>
          ) : (
            <button onClick={skip} className="ob-skip">
              {t.onboarding.skip}
            </button>
          )}
          <div className="flex-spacer" />
          {rules ? (
            <button onClick={finish} className="ob-next">
              {t.onboarding.start} <ArrowRightIcon size={17} />
            </button>
          ) : step < STEPS - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} className="ob-next">
              {t.onboarding.next} <ArrowRightIcon size={17} />
            </button>
          ) : (
            <button onClick={finish} className="ob-next">
              {t.onboarding.start} <ArrowRightIcon size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
