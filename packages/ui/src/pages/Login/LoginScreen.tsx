import { BRAND } from "@openmasq/branding";
import { useState, useEffect } from "react";
import { useAuth } from "../../state/useAuth";
import { BrandMark } from "../../components/media/BrandLogo";
import { ModalTitle } from "../../containers/modals/ModalTitle";
import { AssureStrip, Err, OfflineNote, Field, Spinner, GoogleIcon, SpamHint } from "./parts";
import { friendlyError } from "./loginErrors";

import { useT } from "../../i18n";
/** Track browser connectivity so the login card can explain that sign-in needs a
 *  network (a magic link / code can't be requested offline) instead of failing
 *  silently on submit. Seeds from `navigator.onLine`, then follows online/offline. */
function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Coerce a raw auth error into a readable message — Supabase/network failures
 *  sometimes surface an empty object or a JSON blob (`{}`), which must NOT render
 *  as-is. Falls back to a friendly generic line. */
/**
 * Passwordless account sign-in — a compact centered card (`.auth-card`) floating in
 * the shared `.auth-scrim` OVER the (blurred) app, per the refreshed design-system
 * chat-app kit (`LoginModal`); the old split-screen brand panel + dotted world map
 * were retired. Step 1: enter your email; Supabase emails a magic sign-in link.
 * Step 2: click the link — it returns to the app via the app's deep-link scheme and
 * signs you in. No passwords. Wired via {@link useAuth}.
 *
 * ⚠️ **Un compte n'est PAS créé au premier usage partout** : cela dépend du réglage
 * d'inscription de l'instance Supabase, et la production les a FERMÉES (les accès sont
 * ouverts à la main). L'app ne peut pas le savoir d'avance — elle l'apprend au refus,
 * que `loginErrors.ts` traduit. D'où l'absence de toute promesse de création à l'écran.
 *
 * The "sent" screen adapts to {@link useAuth} `linkFirst`: on a link-first
 * platform (desktop) the LINK is the primary path — no code field up front, just
 * an optional "saisir le code" disclosure as a fallback for a failed deep link.
 * On a code-first platform the code field is shown immediately (`codeSupported`).
 *
 * `heading`/`subheading` re-titrent la PREMIÈRE étape pour un appelant dont la
 * connexion n'est pas un retour mais une ARRIVÉE (la page d'invitation d'`apps/web`,
 * où il faut dire de se connecter avec l'adresse invitée). Tout le reste — le champ
 * code, le renvoi, les erreurs, l'état hors-ligne — reste celui du produit ; c'est
 * précisément ce qu'une carte recopiée perdait.
 */
export function LoginScreen({
  heading = "Content de vous revoir.",
  subheading = "Entrez votre e-mail : nous vous envoyons un lien de connexion, sans mot de passe.",
}: { heading?: string; subheading?: React.ReactNode } = {}) {
  const t = useT();
  const { sendMagicLink, verifyCode, codeSupported, linkFirst, googleSupported } = useAuth();
  const online = useOnline();
  const [stage, setStage] = useState<"email" | "sent">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  // Link-first platforms (desktop) hide the code field behind this disclosure —
  // the link is the primary path; the code is only a fallback for a failed deep link.
  const [showCode, setShowCode] = useState(false);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\s/g, "");
    if (!c || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const r = await verifyCode({ email: email.trim(), code: c });
      // On success, onAuthStateChange flips the gate; on failure, show why.
      if (r.error) setError(friendlyError(r.error));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setVerifying(false);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sendMagicLink(addr);
      if (r.error) setError(friendlyError(r.error));
      else setStage("sent");
      // After they click the link, onAuthStateChange flips the gate automatically.
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-scrim">
      <span className="om-aurora" aria-hidden="true" />
      {/* Not a ModalShell (this card predates it and owns the auth scrim the
          agent-browser gate keys off), but it wears the same chrome: the one-shot
          open sweep and the marker title. */}
      <div className="auth-card" role="dialog" aria-modal="true">
        <div className="modal-sweep login-sweep" aria-hidden="true" />
        <div className="login-head">
          <div className="login-word">
            <span className="login-word-mark"><BrandMark size={22} /></span>
            <span className="cv-display login-word-letters">{BRAND.name}</span>
          </div>
          <ModalTitle as="h1" size="23px">
            {stage === "email" ? heading : "Consultez vos e-mails"}
          </ModalTitle>
          {stage === "email" ? (
            <p className="login-sub">{subheading}</p>
          ) : (
            /* ⚠️ L'ACCUSÉ D'ENVOI a disparu d'ici (18/08) — « Nous avons envoyé un lien à
               vous@… Cliquez dessus… ». Le titre au-dessus dit déjà d'aller voir ses
               e-mails, et le reste décrivait un geste que personne n'attend qu'on lui
               explique : ce qui manquait à cet écran, c'est la réponse au SEUL vrai
               problème — le message n'arrive pas. Elle prend donc la place de l'accusé,
               au lieu de le suivre en petit sous le champ. */
            <SpamHint />
          )}
        </div>

        <div className="login-body">
          {!online && <OfflineNote />}

          {stage === "email" ? (
            <form onSubmit={submitEmail} className="login-fields">
              <Field label={t.login.email}>
                {/* `required` n'est pas décoratif : sans lui, un champ VIDE est valide en HTML,
                    donc le formulaire se soumet et `submitEmail` le renvoie en silence
                    (`if (!addr) return`). Résultat mesuré : le bouton ne faisait RIEN, sans un
                    mot — l'état où quelqu'un croit que l'app est plantée et la ferme. Une
                    adresse MAL FORMÉE, elle, était déjà prise en charge par `type="email"` :
                    Chromium affiche son message, en français, ancré sur le champ. `required`
                    fait simplement entrer le cas vide dans CE mécanisme-là, au lieu d'ouvrir
                    une seconde surface d'erreur pour un seul cas. Le garde de `submitEmail`
                    reste, en défense en profondeur. */}
                <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.login.emailPlaceholder} className="login-input" />
              </Field>
              {error && <Err>{error}</Err>}
              <button type="submit" disabled={busy} className="btn-primary login-btn">
                {busy && <Spinner />}
                {busy ? t.login.sending : t.login.sendLink}
              </button>
              {googleSupported && (
                <>
                  <div className="login-divider">
                    <span className="login-divider-lbl">{t.login.or}</span>
                  </div>
                  {/* Google SSO is temporarily disabled (greyed out, non-cliquable). */}
                  <button type="button" disabled className="login-sso">
                    <GoogleIcon />
                    <span className="om-sweep">{t.login.continueWithGoogle}</span>
                  </button>
                </>
              )}
              <AssureStrip />
              {/* ⚠️ Ne promet PLUS « saisir votre e-mail crée un compte » : sur la
                  production les inscriptions sont fermées (comptes ouverts à la main),
                  et la phrase envoyait quelqu'un buter sur un refus qu'elle venait de
                  démentir. Ce qui reste vrai partout, c'est l'absence de mot de passe ;
                  le cas « adresse pas encore ouverte » est dit par `loginErrors.ts`, au
                  moment où on l'apprend. */}
              <p className="login-note">{t.login.noPassword}</p>
            </form>
          ) : (
            <div className="login-fields">
              {codeSupported && (!linkFirst || showCode) && (
                <form onSubmit={submitCode} className="login-fields">
                  <Field label={t.login.code}>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="12345678"
                      className="login-input"
                    />
                  </Field>
                  <button type="submit" disabled={verifying} className="btn-primary login-btn">
                    {verifying ? t.login.verifying : t.login.signInWithCode}
                  </button>
                </form>
              )}
              {error && <Err>{error}</Err>}
              {codeSupported && linkFirst && !showCode && (
                <button type="button" onClick={() => setShowCode(true)} className="login-link login-code-disclose">
                  <span className="om-sweep">{t.login.linkNotOpening}</span>
                </button>
              )}
              <div className="login-code-row">
                <button type="button" onClick={() => { setStage("email"); setError(null); setCode(""); setShowCode(false); }} className="login-link"><span className="om-sweep">{t.login.useAnotherAddress}</span></button>
                <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { const r = await sendMagicLink(email.trim()); if (r.error) setError(friendlyError(r.error)); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); } }} className="login-link"><span className="om-sweep">{busy ? t.login.sending : codeSupported && !linkFirst ? t.login.resend : t.login.resendLink}</span></button>
              </div>
              <AssureStrip />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
