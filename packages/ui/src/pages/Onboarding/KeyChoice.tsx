import { BRAND } from "@openmasq/branding";
import { useState } from "react";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { CheckIcon } from "../../components/brand";
import { KeySteps } from "./KeySteps";
import { platformAccessServed } from "../../send/platformAccess";

/** The providers the onboarding offers a key slot for — OpenRouter first (one key,
 *  every model), then the majors. Labels/key URLs come from the single-source
 *  registry (`@openmasq/llm` PROVIDERS, rule 9) — never re-typed here. */
const KEY_PROVIDERS: ProviderId[] = [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
];

/**
 * Onboarding step « Accès aux modèles » : the subscription-vs-your-own-key choice.
 *
 * Both paths already exist in Réglages (AccountTab's billing toggle + the per-provider
 * key modal); this step only SURFACES the choice at first run. The key is write-only:
 * `onSaveKey` → `host.keys.set` (encrypted in main, never read back — the renderer
 * only learns WHICH providers hold one), exactly like the Settings path.
 *
 * OpenRouter is the one provider with TWO roads, and they are not offered side by side:
 * the OAuth flow mints a key with nothing to copy, so it is the whole panel until the
 * person says they already have one — at which point they get the same guided checklist
 * (`KeySteps`) as every other provider. Showing both at once made the shorter road look
 * like one option out of two.
 */
export function KeyChoice({
  mode,
  onMode,
  onSaveKey,
  onConnectOpenRouter,
  keyConfigured,
}: {
  /** Le choix DÉJÀ fait, ou `null` — personne n'a encore répondu. Précocher, c'est faire
   *  disparaître la seule vraie question du parcours ; et la précocher sur l'abonnement,
   *  c'est la préremplir avec ce qui coûte. */
  mode: "subscription" | "byo" | null;
  onMode: (m: "subscription" | "byo") => void;
  /** Absent (no `host.keys` — preview) ⇒ the key form is not rendered. */
  onSaveKey?: (provider: string, key: string) => Promise<void>;
  /** OAuth PKCE — the platform opens the browser, receives the callback and stores the
   *  key ITSELF (it never reaches this component). Absent ⇒ only the paste path shows. */
  onConnectOpenRouter?: () => Promise<boolean>;
  keyConfigured: ReadonlySet<string>;
}) {
  // Ce build a-t-il un service hébergé ? Sans lui, « Mon compte » n'existe pas.
  const served = platformAccessServed();
  const [provider, setProvider] = useState<ProviderId>("openrouter");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState("");

  // « Obtenir une clé gratuitement » — the key ends up on the USER's OpenRouter account,
  // so their own credits AND their own free-model quota. That second half matters: those
  // quotas are per ACCOUNT at OpenRouter, so a key we minted would only ever hand out a
  // slice of one shared bucket.
  const canConnect = provider === "openrouter" && !!onConnectOpenRouter;
  const connect = async () => {
    if (!onConnectOpenRouter || connecting) return;
    setConnecting(true);
    setError("");
    try {
      if (await onConnectOpenRouter()) setConnectFailed(false);
      else {
        setConnectFailed(true);
        setError("Connexion non terminée. Réessayez — rien n'a été enregistré.");
      }
    } catch {
      setConnectFailed(true);
      setError("Connexion impossible. Réessayez dans un instant.");
    } finally {
      setConnecting(false);
    }
  };

  const save = async (key: string): Promise<boolean> => {
    if (!onSaveKey) return false;
    setBusy(true);
    setError("");
    try {
      await onSaveKey(provider, key);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "La clé n'a pas pu être enregistrée. Réessayez.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickProvider = (p: ProviderId) => {
    setProvider(p);
    setManual(false);
    setConnectFailed(false);
    setError("");
  };

  const option = (
    value: "subscription" | "byo",
    title: string,
    sub: string,
    /** « conseillé » — la recommandation se lit SUR la carte, là où l'on choisit. */
    tag?: string,
  ) => (
    <button
      type="button"
      className={`ob-access-opt${mode === value ? " on" : ""}`}
      onClick={() => onMode(value)}
      aria-pressed={mode === value}
    >
      {/* The radio mark is what makes the two cards read as ONE choice rather than two
          buttons — the selected border alone was carrying that on its own. */}
      <span className="ob-access-radio" aria-hidden="true">
        {mode === value && <CheckIcon size={11} />}
      </span>
      <span className="ob-access-opt-body">
        <span className="ob-access-opt-title">
          {title}
          {tag && <span className="ob-access-tag"> {tag}</span>}
        </span>
        <span className="ob-access-opt-sub">{sub}</span>
      </span>
    </button>
  );

  return (
    <div className="ob-access">
      {/* ⚠️ Cette carte ne promet PLUS de modèle gratuit sur le compte de l'app : ce qu'elle
          décrit se paie en crédits d'abonnement, et un compte NEUF n'en a pas. Une carte qui
          promet la gratuité à qui n'a rien souscrit vend un produit qu'il n'a pas — c'est
          l'autre carte qui porte le chemin sans abonnement.
          Et elle DISPARAÎT dans un build sans service hébergé (`send/platformAccess.ts`) :
          il n'y a alors pas de compte à proposer, donc pas de choix à poser — la clé est
          le seul chemin, et la question devient une étape. */}
      {served &&
        option(
          "subscription",
          `Mon compte ${BRAND.name}`,
          "Aucune clé à gérer : les modèles puisent dans les crédits de votre abonnement.",
        )}
      {/* La voie RECOMMANDÉE, et la seule à ne rien coûter : une clé OpenRouter atteint tous
          les modèles — les gratuits compris, sur le quota du compte de l'utilisateur, jamais
          le nôtre. Le « conseillé » vit sur la carte parce que c'est ICI qu'on choisit ; la
          suite (OAuth en un clic, rien à copier) est déjà sous la carte une fois cochée. */}
      {option(
        "byo",
        "Ma propre clé API",
        // « jamais relue par l'interface » : un invariant interne qui fuyait dans
        // l'écran — l'utilisateur n'a pas d'« interface », il a sa machine.
        "Une clé OpenRouter ouvre tous les modèles, les gratuits compris, sur votre compte. Un clic pour l'obtenir ; elle reste chiffrée sur cette machine.",
        "conseillé",
      )}

      {(mode === "byo" || !served) && onSaveKey && (
        <div className="ob-access-key">
          <div className="ob-access-providers">
            {KEY_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                className={`ob-access-provider${provider === p ? " on" : ""}`}
                onClick={() => pickProvider(p)}
                aria-pressed={provider === p}
              >
                {keyConfigured.has(p) && <CheckIcon size={12} />} {PROVIDERS[p].label}
                {/* Une seule clé atteint tous les modèles : c'est la raison du conseil,
                    et elle vaut d'être dite là où l'on choisit, pas dans une note. */}
                {p === "openrouter" && <span className="ob-access-tag">conseillé</span>}
              </button>
            ))}
          </div>
          {keyConfigured.has(provider) ? (
            <div className="ob-access-saved">
              <CheckIcon size={14} /> Clé {PROVIDERS[provider].label} enregistrée — vous êtes
              prêt.
            </div>
          ) : canConnect && !manual ? (
            <>
              <button
                type="button"
                className="ob-access-connect"
                disabled={connecting}
                onClick={() => void connect()}
                title={`${BRAND.name} se connecte à votre compte OpenRouter : vos crédits, votre quota.`}
              >
                {connecting
                  ? "Autorisation dans votre navigateur…"
                  : connectFailed
                    ? "Réessayer"
                    : "Obtenir une clé gratuitement"}
              </button>
              <p className="ob-access-hint">
                OpenRouter s&apos;ouvre, vous acceptez, la clé revient chiffrée ici — rien à
                copier.
              </p>
              {/* L'échec est une issue, pas seulement un message : sans cette porte on
                  reste sur un bouton qui vient de refuser. */}
              <button
                type="button"
                className="ob-access-manual"
                onClick={() => setManual(true)}
              >
                {connectFailed
                  ? "Créer la clé à la main"
                  : "J'ai déjà une clé OpenRouter"}
              </button>
            </>
          ) : (
            <KeySteps key={provider} provider={provider} onSave={save} saving={busy} />
          )}
          {error && <div className="ob-access-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
