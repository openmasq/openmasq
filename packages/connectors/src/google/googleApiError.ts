/**
 * Turn a Google REST failure into a PRECISE, actionable FR hint.
 *
 * The desktop adapter's authed fetch (`run.ts`) throws
 * `Upstream request failed (<status>): <REASON_CODE>`, where the reason is a safe
 * enum token lifted from Google's error body (`SERVICE_DISABLED`,
 * `ACCESS_TOKEN_SCOPE_INSUFFICIENT`, `accessNotConfigured`, `PERMISSION_DENIED`…).
 *
 * The three 40x causes each need a DIFFERENT fix, so a blanket "reconnect the
 * connector" message left users looping (the reported Gmail 403). This names the
 * exact one:
 *   • API not enabled on the project → enable it in the Cloud console
 *   • token lacks the required scope → reconnect + tick the consent checkbox
 *   • token invalid / expired (401)  → reconnect
 */
export interface GoogleErrorLabels {
  /** The API to enable, e.g. "API Gmail" / "API Google Calendar". */
  api: string;
  /** The connector name to reconnect, as shown in the UI (e.g. "Gmail (lecture & envoi)"). */
  connector: string;
  /** The consent to grant, e.g. "la LECTURE de vos emails" / "l'ENVOI d'emails". */
  scope: string;
  /** Verb for a non-auth failure, e.g. "Lecture Gmail impossible". */
  fallback: string;
}

export function googleApiErrorHint(err: unknown, l: GoogleErrorLabels): string {
  const msg = err instanceof Error ? err.message : String(err);
  const disabled = /SERVICE_DISABLED|accessNotConfigured/i.test(msg);
  const scope = /SCOPE_INSUFFICIENT|insufficientPermissions/i.test(msg);
  const is401 = /\b401\b|UNAUTHENTICATED/.test(msg);
  const is403 = /\b403\b|PERMISSION_DENIED/.test(msg);
  if (disabled) {
    return (
      `« ${l.api} » n'est pas activée sur votre projet Google Cloud. Ouvrez ` +
      `console.cloud.google.com → « APIs & Services » → « Bibliothèque », activez ` +
      `« ${l.api} », patientez ~1 min, puis réessayez.`
    );
  }
  if (scope) {
    return (
      `Accès refusé : l'autorisation nécessaire n'a pas été accordée. Reconnectez ` +
      `« ${l.connector} » (bouton « Reconnecter » / « Mes clés ») et, sur l'écran de ` +
      `consentement Google, cochez bien ${l.scope}.`
    );
  }
  if (is401) {
    return `Jeton Google expiré ou invalide — reconnectez « ${l.connector} ».`;
  }
  if (is403) {
    return (
      `Accès refusé (403). Vérifiez que « ${l.api} » est activée et que ${l.scope} ` +
      `a été autorisé au consentement, puis reconnectez « ${l.connector} ».`
    );
  }
  return `${l.fallback} : ${msg}`;
}
