import { unredactArgs } from "@openmasq/redact";

/**
 * Un-redact a link's `href`, URL-ENCODING aware.
 *
 * The message content is de-redacted as plain text (`store.ts` `fromWire` →
 * `unredact`) before Markdown parses it, so the VISIBLE link text already shows the
 * real value. But a fake that contains a SPACE — an ORG fake like "Brentley System"
 * minted for a glued handle ("atelierverrier") — lands in a URL space-ENCODED
 * (`%20` or `+`), a form the literal `unredact` never matches. So the FAKE survived
 * only in the `href` and the link opened a BROKEN URL (real text, fake destination —
 * the reported bug). `unredactArgs` also restores the `%20`/`+`-encoded forms, so the
 * href resolves to the real URL. Empty/absent vault ⇒ href unchanged.
 */
export function realLinkHref(
  href: string | undefined,
  vault?: Record<string, string>,
): string | undefined {
  if (!href || !vault || Object.keys(vault).length === 0) return href;
  return unredactArgs(href, vault);
}
