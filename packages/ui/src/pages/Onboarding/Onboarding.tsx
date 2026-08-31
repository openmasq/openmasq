import { BRAND } from "@openmasq/branding";
import { useRef, useState } from "react";
import type { Settings } from "../../types";
import { ArrowRightIcon, ChevLeftIcon } from "../../components/brand";
import { captureEvent } from "../../analytics";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { RedactionRulesContent } from "../../containers/modals/redaction/RedactionRulesContent";
import { sectionGuides, sectionOneLiner } from "../../help";
import { useT } from "../../i18n";
import { RedactionDemo } from "../../components/RedactionDemo";
import { KeyChoice } from "./KeyChoice";
import { platformAccessServed, subscriptionsSold } from "../../send/platformAccess";

/* redact — first-run onboarding.
   FOUR steps: what the app does (shown, not configured), where things live, how you
   reach the models (the app's account vs your own key — the ONE genuine first-run
   choice, optional and skippable: the free model works with no action), and you're
   ready. It used to be a single screen of 19 redaction-category toggles — a settings
   pane wearing a welcome hat, which spent the whole of first-run attention on the one
   thing that already works by default, and never named Coffre / Mémoire / Compétences /
   Workflows / Bibliothèque at all.
   The rules did not move OUT of reach: « Régler finement » swaps this same card to the
   very same `RedactionRulesContent` the Réglages pane uses, and it stays there for ever
   after. Choices still write into the real Settings live; "Commencer" (or "Passer")
   marks onboarding complete. */

/* The accent is the redaction palette's SKY hue, reached the way every marked surface
   reaches it: the `.hl-<hue>` class, then `--mk` / `--mk-ink` in the stylesheet. It was a
   frozen `#FF8FA3` — the pink — which root rule 12 forbids for exactly the reason it bit
   here: the highlight painted a background but left the text on `--text-strong`, so in the
   dark themes near-white ink sat on a light pastel. Naming the hue instead lets the ink
   invert with it. */

const STEPS = 4;

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
  // Ce build a-t-il un service hébergé (passerelle + comptes) ? Il décide de ce que ce
  // parcours peut PROMETTRE — `send/platformAccess.ts`.
  const served = platformAccessServed();
  const [step, setStep] = useState(0);
  const [rules, setRules] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef);

  function finish() {
    captureEvent({ name: "onboarding", step: "done" });
    onChange({ ...settings, onboarded: true });
  }
  /* « Passer » se mesure AUSSI, et avec l'écran où on l'a cliqué : sans ça, le seul
     parcours qu'on voudrait comprendre — celui qui abandonne — est invisible, et
     « done » seul laisse croire que tout le monde va au bout. */
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
                <div className="cv-eyebrow ob-eyebrow">{t.onboarding.places.eyebrow}</div>
                <h1 className="cv-display ob-title">{t.onboarding.places.title}</h1>
                <p className="ob-sub">{t.onboarding.places.sub}</p>
                {/* UNE ligne par endroit, pas le paragraphe du guide : six paragraphes
                    à la deuxième page d'un premier lancement, ça se saute. La phrase
                    longue existe toujours — dans « Aide », quand on la cherche. */}
                <dl className="ob-sections">
                  {sectionGuides(t).map((s) => (
                    <div key={s.id} className="ob-section">
                      <dt>{s.label}</dt>
                      <dd>{sectionOneLiner(s)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : step === 2 ? (
              <>
                <div className="cv-eyebrow ob-eyebrow">{t.onboarding.access.eyebrow}</div>
                {/* Sans service hébergé (`send/platformAccess.ts`), il n'y a pas de compte
                    à proposer ; avec, mais sans rien à VENDRE (le défaut), le choix est
                    « votre compte ou votre clé » — jamais un abonnement qui n'existe pas. */}
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
                  // `?? null` : rien n'est coché tant que rien n'a été choisi.
                  mode={settings.billingMode ?? null}
                  onMode={(m) => onChange({ ...settings, billingMode: m })}
                  onSaveKey={onSaveKey}
                  onConnectOpenRouter={onConnectOpenRouter}
                  keyConfigured={keyConfigured ?? new Set()}
                />
              </>
            ) : (
              <>
                <div className="cv-eyebrow ob-eyebrow">{t.onboarding.ready.eyebrow}</div>
                <h1 className="cv-display ob-title">{t.onboarding.ready.title}</h1>
                {/* Ce que l'étape précédente laisse en suspens : le redaction ne dépend
                    d'AUCUN des deux accès, et « Passer » ne coupe rien. La deuxième
                    phrase est ce qui rend la première vérifiable — un modèle gratuit est
                    sélectionné d'office (`prompt/models.ts` DEFAULT_MODEL_ID), donc une
                    installation neuve écrit sans clé et sans abonnement. */}
                <p className="ob-sub">
                  {/* Sans service hébergé, aucun modèle n'est joignable tant qu'un accès
                      n'est pas branché : le dire, plutôt que promettre un modèle prêt. */}
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
