/**
 * The login card's presentational leaves — the small, stateless pieces
 * `LoginScreen.tsx` composes. Split out to keep that file under the 300-LOC cap
 * (rule 1); they are single-use, so they stay in this page's folder rather than
 * being promoted to `components/` (see `pages/CLAUDE.md` — promotion by reuse).
 */

/**
 * The mono assurance strip under the actions.
 *
 * ⚠️ The design kit prints "CHIFFRÉ DE BOUT EN BOUT · SANS MOT DE PASSE" here. The
 * first half is NOT true of this flow and is deliberately not reproduced: sign-in
 * is a Supabase magic link / one-time code delivered by e-mail over TLS — the auth
 * server necessarily sees the token, so there is no end-to-end encryption to claim.
 * On a privacy product an unverifiable security claim is worse than no claim, so
 * this states only what the sign-in code actually does.
 */
export function AssureStrip() {
  return (
    <div className="login-assure">
      <svg
        className="login-assure-icon"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      SANS MOT DE PASSE · LIEN ENVOYÉ PAR E-MAIL
    </div>
  );
}

/** Inline auth error — an accessible alert box (icon + tinted panel) so a failure
 *  is noticed, not a stray line of red text. `role="alert"` announces it to screen
 *  readers; `friendlyError` upstream keeps the message human. */
export function Err({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-err" role="alert">
      <svg
        className="login-err-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** Shown on the login card when the machine is offline: signing in needs the
 *  network (to request a magic link / verify a code), so explain that up front
 *  rather than letting the user submit into a silent "Failed to fetch". */
export function OfflineNote() {
  return (
    <div className="login-offline" role="status">
      <svg
        className="login-offline-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 1l22 22" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span>Vous êtes hors ligne. La connexion nécessite un accès réseau — vérifiez votre connexion, puis réessayez.</span>
    </div>
  );
}

/**
 * « Rien reçu ? » — le rappel des spams, montré UNIQUEMENT après l'envoi.
 *
 * Un e-mail d'authentification est le message le plus filtré qui existe (expéditeur
 * transactionnel, lien, code) : le premier motif de « ça ne marche pas » n'est pas une
 * panne mais un dossier indésirable. Le dire à l'écran coûte une ligne et évite un
 * renvoi en boucle, puis un abandon.
 *
 * ⚠️ Avant l'envoi, la phrase n'a aucun sens — pire, elle annonce un problème à qui n'a
 * encore rien demandé. `LoginScreen` ne la monte donc que dans l'étape « envoyé », et
 * `LoginScreen.test.tsx` épingle les deux moitiés de cette règle.
 *
 * Le même rappel, avec le même glyphe de boîte de réception, vit sur les trois autres
 * écrans de connexion du produit (mobile, extension, porte du centre d'aide) : chacun a sa
 * feuille de style, aucun ne peut importer celle d'un autre. La copie est donc nécessaire,
 * et c'est un TEST qui la tient — `spamHint.parity.test.ts` LIT les quatre fichiers.
 */
export const SPAM_HINT = "Rien reçu ? Regardez dans vos spams (courriers indésirables).";

export function SpamHint() {
  return (
    <p className="login-hint">
      <svg
        className="login-hint-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
      <span>{SPAM_HINT}</span>
    </p>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="login-field">
      <span className="login-field-label">{label}</span>
      {children}
    </label>
  );
}

/** A small spinning ring shown inside a button while its action is in flight. */
export function Spinner() {
  return <span className="login-spin" aria-hidden />;
}

/** The standard multi-colour Google "G" (their brand mark — expected on the button). */
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-7.8z" />
      <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.6c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.4L6 10.2c.9-2.6 3.2-4.6 6-4.6z" />
    </svg>
  );
}
