/**
 * WHO is talking to our API — a header, set by the desktop app on every one of its calls.
 *
 * ⚠️ **This is not a security boundary, and it must never be used as
 * one.** Anyone can forge this header; identity and authority come from the
 * verified token, never from here (rule 7). It answers a PRODUCT question, not
 * an authorization one: "does this request come from the desktop app?" — and lying
 * opens no door, it just enrolls you on a distribution list.
 *
 * What it makes possible, and wasn't before: the backend sees the same
 * authenticated requests go by from the app, the website, the organization console and the
 * ops console, unable to tell them apart. A rule saying "people who signed in
 * ON THE DESKTOP APP" was therefore unenforceable — there was no way to say it.
 *
 * ⚠️ `User-Agent` wasn't an option: Chromium forbids `fetch` from a
 * renderer from setting it (guarded header). Hence a header of our own.
 *
 * The name DERIVES from the brand (`brandHeader`, rule 9); the backend, which can't
 * import a sibling app (`pnpm check:dup`), derives it from the same source. The backend-side
 * parity test (`clientApp.parity.test.ts`) reads this file back.
 */
import { brandHeader } from "@openmasq/branding";

/** The header. Lowercase: Node normalizes it, and a case comparison is a trap. */
export const CLIENT_HEADER = brandHeader("client");

/** The product this binary IS. A single value — there's no other one here.
 *  NOT exported: nothing else needs it here, and the parity test reads it as
 *  TEXT (it can't import it — sibling apps). An export nobody imports is
 *  dead code to knip, and the ratchet is right. */
const CLIENT_PRODUCT = "desktop";

/**
 * The value sent: `desktop/0.8.0`, or `desktop` if the version hasn't been baked
 * (dev). The backend only reads the product; the version travels for the logs, and
 * that's what will one day let an error be correlated to a client version.
 */
export function clientIdentityHeader(version?: string): string {
  return version ? `${CLIENT_PRODUCT}/${version}` : CLIENT_PRODUCT;
}
