import { BRAND } from "@openmasq/branding";
import { useState, useEffect } from "react";
import { useAuth } from "../../state/auth/useAuth";
import { BrandMark } from "../../components/media/BrandLogo";
import { ModalTitle } from "../../containers/modals/ModalTitle";
import { AssureStrip, Err, OfflineNote, Field, Spinner, GoogleIcon, SpamHint } from "./parts";
import { friendlyError } from "./loginErrors";
import { hasSeenAccountOnDevice } from "./seenAccount";
import { platformAccessServed } from "../../send/platformAccess";

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
 * ⚠️ **An account is NOT created on first use everywhere**: that depends on the
 * Supabase instance's sign-up setting, and production has them CLOSED (accounts are
 * opened by hand). The app can't know it in advance — it learns it on refusal,
 * which `loginErrors.ts` translates. Hence the absence of any creation promise on screen.
 *
 * The "sent" screen adapts to {@link useAuth} `linkFirst`: on a link-first
 * platform (desktop) the LINK is the primary path — no code field up front, just
 * an optional "saisir le code" disclosure as a fallback for a failed deep link.
 * On a code-first platform the code field is shown immediately (`codeSupported`).
 *
 * `heading`/`subheading` re-title the FIRST step for a caller whose
 * sign-in isn't a return but an ARRIVAL (`apps/web`'s invitation page,
 * where it must say to sign in with the invited address). Everything else — the code
 * field, the resend, the errors, the offline state — stays the product's own; that's
 * exactly what a copy-pasted card used to lose.
 */
export function LoginScreen({
  heading,
  subheading,
}: { heading?: string; subheading?: React.ReactNode } = {}) {
  const t = useT();
  // « Content de vous revoir » only once an account has REALLY been seen on this device
  // (`seenAccount.ts`); a fresh install gets the neutral « Connexion à … ». Read once —
  // the answer cannot change while the card is on screen.
  const [seen] = useState(() => hasSeenAccountOnDevice());
  const title = heading ?? (seen ? t.login.heading : t.login.headingFirst(BRAND.name));
  const sub = subheading ?? t.login.subheading;
  // On the hosted service sign-ups are closed (accounts are opened by hand): say so
  // UNDER the field, before the refusal `loginErrors.ts` would otherwise be the first to
  // mention. A self-hosted stack with no hosted service gets no such promise.
  const inviteOnly = platformAccessServed();
  const { sendMagicLink, verifyCode, codeSupported, linkFirst, googleSupported, signInWithGoogle } =
    useAuth();
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
            {stage === "email" ? title : t.login.checkYourEmail}
          </ModalTitle>
          {stage === "email" ? (
            <p className="login-sub">{sub}</p>
          ) : (
            /* ⚠️ The SEND ACKNOWLEDGMENT disappeared from here (18/08) — « Nous avons envoyé un lien à
               vous@… Cliquez dessus… ». The heading above already says to go check your
               email, and the rest described an action nobody expects to have
               explained to them: what this screen lacked was the answer to the ONE real
               problem — the message doesn't arrive. It therefore takes the acknowledgment's place,
               instead of following it in small print under the field. */
            <SpamHint />
          )}
        </div>

        <div className="login-body">
          {!online && <OfflineNote />}

          {stage === "email" ? (
            <form onSubmit={submitEmail} className="login-fields">
              <Field label={t.login.email}>
                {/* `required` is not decorative: without it, an EMPTY field is valid HTML,
                    so the form submits and `submitEmail` silently bounces it
                    (`if (!addr) return`). Measured result: the button did NOTHING, without a
                    word — the state where someone believes the app has crashed and closes it. A
                    MALFORMED address, on the other hand, was already handled by `type="email"`:
                    Chromium shows its message, in French, anchored on the field. `required`
                    simply brings the empty case into THAT mechanism, instead of opening
                    a second error surface for a single case. `submitEmail`'s guard
                    stays, as defense in depth. */}
                <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.login.emailPlaceholder} className="login-input" />
              </Field>
              {inviteOnly && <p className="login-note login-invite">{t.login.inviteOnly}</p>}
              {error && <Err>{error}</Err>}
              <button type="submit" disabled={busy} className="btn-primary login-btn">
                {busy && <Spinner />}
                {busy ? t.login.sending : t.login.sendLink}
              </button>
              {/* Google SSO exists only where the HOST exposes it (`auth.signInWithGoogle`):
                  a host whose SSO is off simply omits the slot, and no greyed button is
                  drawn in its place — a disabled control promises a road that isn't there. */}
              {googleSupported && (
                <>
                  <div className="login-divider">
                    <span className="login-divider-lbl">{t.login.or}</span>
                  </div>
                  <button
                    type="button"
                    className="login-sso"
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      void signInWithGoogle().then((r) => {
                        if (r.error) setError(friendlyError(r.error));
                      });
                    }}
                  >
                    <GoogleIcon />
                    <span className="om-sweep">{t.login.continueWithGoogle}</span>
                  </button>
                </>
              )}
              <AssureStrip />
              {/* ⚠️ No longer promises "entering your email creates an account": in
                  production sign-ups are closed (accounts opened by hand),
                  and the sentence used to send someone straight into a refusal it had just
                  denied. What stays true everywhere is the absence of a password;
                  the "address not yet opened" case is said by `loginErrors.ts`, at the
                  moment it's learned. */}
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
