import type { Messages } from "@openmasq/i18n";
/** Time-of-day greeting — the home screen's headline. The user's first name (when known)
 *  is appended by the caller; see `containers/shell/accountName.ts` `firstNameOf`. The
 *  three words live in `@openmasq/i18n`; the CLOCK rule (noon, 6pm) lives here. */
export function timeGreeting(hour: number, t: Messages): string {
  const g = t.conversation.greeting;
  return hour < 12 ? g.morning : hour < 18 ? g.afternoon : g.evening;
}
