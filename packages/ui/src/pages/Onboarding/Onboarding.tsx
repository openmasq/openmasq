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
import { platformAccessServed } from "../../send/platformAccess";

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
                <div className="cv-eyebrow ob-eyebrow">REDACTION</div>
                <h1 className="cv-display ob-title">Régler finement</h1>
                <p className="ob-sub">
                  Ces réglages sont déjà bons par défaut. Vous les retrouverez à tout moment
                  dans Réglages&nbsp;→&nbsp;Compte.
                </p>
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
                <div className="cv-eyebrow ob-eyebrow">REDACTION</div>
                <h1 className="cv-display ob-title">
                  Écrivez{" "}
                  <span className="ob-title-hl hl-sky">librement</span>
                </h1>
                <p className="ob-sub">
                  Avant qu&apos;un message ne parte, {BRAND.name} repère les données sensibles et les
                  remplace par de fausses valeurs. Le modèle ne travaille que sur celles-ci —
                  vous, vous continuez de voir les vraies. C&apos;est ce remplacement qu&apos;on
                  appelle le redaction.
                </p>
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
                    Les personnalités, grandes marques et pays ne sont{" "}
                    <strong>jamais masqués</strong>&nbsp;: une question de culture générale
                    reste une question de culture générale.
                  </li>
                  <li>
                    Avant une recherche sur le web, {BRAND.name} vous <strong>propose de révéler</strong>{" "}
                    ce qui est masqué — sans quoi la recherche porterait sur une entreprise ou
                    une ville qui n&apos;existent pas.
                  </li>
                </ul>
              </>
            ) : step === 1 ? (
              <>
                <div className="cv-eyebrow ob-eyebrow">VOTRE ESPACE</div>
                <h1 className="cv-display ob-title">Six endroits, six usages</h1>
                <p className="ob-sub">
                  La barre de gauche mène à tout. Vous n&apos;avez rien à y préparer&nbsp;: chaque
                  endroit se remplit en travaillant.
                </p>
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
                <div className="cv-eyebrow ob-eyebrow">ACCÈS AUX MODÈLES</div>
                {/* Sans service hébergé (`send/platformAccess.ts`), il n'y a pas d'abonnement
                    à proposer : le titre ne pose plus un choix qui n'existe pas. */}
                <h1 className="cv-display ob-title">
                  {served ? "Abonnement, ou votre clé" : "Votre clé, ou un modèle local"}
                </h1>
                <p className="ob-sub">
                  {served
                    ? "Vous changerez d'avis quand vous voudrez. Dans les deux cas, le redaction s'applique avant chaque envoi."
                    : "Une clé, un modèle qui tourne sur votre machine, ou votre abonnement Claude Code / Codex — le redaction s'applique avant chaque envoi, quel que soit le chemin."}
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
                <div className="cv-eyebrow ob-eyebrow">C&apos;EST PRÊT</div>
                <h1 className="cv-display ob-title">La protection, elle, est déjà active</h1>
                {/* Ce que l'étape précédente laisse en suspens : le redaction ne dépend
                    d'AUCUN des deux accès, et « Passer » ne coupe rien. La deuxième
                    phrase est ce qui rend la première vérifiable — un modèle gratuit est
                    sélectionné d'office (`prompt/models.ts` DEFAULT_MODEL_ID), donc une
                    installation neuve écrit sans clé et sans abonnement. */}
                <p className="ob-sub">
                  {served ? (
                    <>
                      Elle ne dépend ni d&apos;un abonnement ni d&apos;une clé&nbsp;: dès votre
                      premier message, le redaction s&apos;applique. Un modèle gratuit est déjà
                      sélectionné et fonctionne avec votre compte {BRAND.name}.
                    </>
                  ) : (
                    // Sans service hébergé, aucun modèle n'est joignable tant qu'un accès
                    // n'est pas branché : le dire, plutôt que promettre un modèle prêt.
                    <>
                      Elle ne dépend d&apos;aucun compte&nbsp;: dès votre premier message, le
                      redaction s&apos;applique. Il ne manque qu&apos;un accès à un
                      modèle&nbsp;— une clé, un serveur local, ou votre CLI.
                    </>
                  )}
                </p>
                <ul className="ob-ready">
                  <li>
                    Le nom du modèle est sous la zone de saisie — cliquez-le pour en changer,
                    ou pour brancher un accès si vous avez passé l&apos;étape.
                  </li>
                  <li>
                    Tapez <strong>/</strong> dans la zone de message pour vos compétences, vos
                    workflows et «&nbsp;retiens que…&nbsp;».
                  </li>
                  <li>
                    Un doute&nbsp;? <strong>Aide</strong>, en bas de la barre de droite, reprend
                    tout ça — la démonstration comprise.
                  </li>
                </ul>
                <button type="button" className="ob-tune" onClick={() => setRules(true)}>
                  Régler finement le redaction
                </button>
              </>
            )}
          </div>
        </div>

        <div className="ob-footer">
          {rules ? (
            <button onClick={() => setRules(false)} className="ob-skip">
              <ChevLeftIcon size={16} /> Retour
            </button>
          ) : (
            <button onClick={skip} className="ob-skip">
              Passer
            </button>
          )}
          <div className="flex-spacer" />
          {rules ? (
            <button onClick={finish} className="ob-next">
              Commencer <ArrowRightIcon size={17} />
            </button>
          ) : step < STEPS - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} className="ob-next">
              Suivant <ArrowRightIcon size={17} />
            </button>
          ) : (
            <button onClick={finish} className="ob-next">
              Commencer <ArrowRightIcon size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
