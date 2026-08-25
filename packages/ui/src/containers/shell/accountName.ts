/**
 * Derive a display NAME from a signed-in account's email, so the sidebar/rail avatar
 * shows the user's INITIALS instead of a generic "V". `Avatar` extracts initials by
 * splitting on whitespace and taking one letter per word, so we turn the email
 * local-part into a title-cased, space-separated name:
 *   `julien.sabourdin@gmail.com` → "Julien Sabourdin" → avatar "TG"
 *   `julien@gmail.com`           → "Julien"           → avatar "T"
 * The local-part is split on the usual email separators (`. _ + -`). Falls back to
 * "Vous" when there is no usable email (the avatar then shows "V", the prior default).
 */
export function accountDisplayName(email?: string | null): string {
  const local = email?.split("@")[0]?.trim();
  if (!local) return "Vous";
  const parts = local.split(/[._+-]+/).filter(Boolean);
  if (!parts.length) return "Vous";
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/**
 * The user's FIRST name for the home greeting ("Bonsoir Julien"). Prefers the auth
 * provider's real name (`AuthUser.name`, from OAuth `user_metadata`); falls back to the
 * first token of the email-derived {@link accountDisplayName} so an email-only sign-in
 * still gets a name rather than a lone "Bonsoir". Returns undefined only when there's no
 * usable source (the placeholder "Vous" is treated as none) — the caller then greets
 * without a name. Never invents one beyond these sources.
 */
export function firstNameOf(user?: { name?: string; email?: string } | null): string | undefined {
  const cased = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const fromName = user?.name?.trim().split(/\s+/)[0];
  if (fromName) return cased(fromName);
  const display = accountDisplayName(user?.email);
  return display === "Vous" ? undefined : cased(display.split(" ")[0]);
}
