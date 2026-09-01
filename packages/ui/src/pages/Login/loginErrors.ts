/**
 * What the sign-in screen SHOWS of an authentication failure.
 *
 * Supabase answers in English and in server jargon; this function translates the cases
 * we know how to name and **lets the rest through as is**. The fallback is not
 * laziness: swallowing an unknown message would give a form that « ne fait rien », and
 * the product's rule is that a real failure says so. An English message is a lesser evil
 * than silence — but every case we learn to name must come down here.
 *
 * ⚠️ **« Signups not allowed » is not a failure, it is a SETTING**: production Supabase
 * has sign-ups closed (accounts are opened by hand), so any address that has not been
 * provisioned is refused when the link is sent. The raw message said « Signups not
 * allowed for this instance » in English on a French screen, without ever letting one
 * guess that the problem is the address itself (seen on PostHog on 14/08).
 */
export function friendlyError(e: unknown): string {
  const s = typeof e === "string" ? e.trim() : e instanceof Error ? e.message.trim() : "";
  if (!s || s === "[object Object]" || /^\{.*\}$/.test(s) || /^\[.*\]$/.test(s)) {
    return "Impossible pour le moment. Vérifiez votre connexion et réessayez.";
  }
  if (/rate limit|too many|429/i.test(s)) return "Trop de tentatives. Patientez un instant puis réessayez.";
  if (/failed to fetch|network|fetch failed/i.test(s)) return "Réseau indisponible. Vérifiez votre connexion et réessayez.";
  // GoTrue's two phrasings: the instance-wide lock and the email provider's own.
  if (/signups? (?:not allowed|are disabled|is disabled)|disabled? signups?/i.test(s)) {
    return "Aucun compte pour cette adresse, et les inscriptions sont fermées pour le moment. Vérifiez l’orthographe — si elle est bonne, l’accès reste à ouvrir de notre côté.";
  }
  return s;
}
