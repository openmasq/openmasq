/** Time-of-day greeting (FR) — the home screen's headline. The user's first name (when
 *  known) is appended by the caller; see `containers/shell/accountName.ts` `firstNameOf`. */
export function timeGreeting(hour: number): string {
  return hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
}
