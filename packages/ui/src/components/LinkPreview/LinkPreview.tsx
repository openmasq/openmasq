import type { LinkPreviewData } from "../../host";

/**
 * An OpenGraph link-preview card. The whole card is a link that opens externally
 * (Electron routes `target="_blank"` through the system browser). SECURITY: the
 * image is ALWAYS a `data:` URL fetched by the platform in main — never a remote
 * `<img src="https://…">` (the CSP blocks that anyway); title/description are
 * plain text, escaped by React. Rendered inline, directly after its link.
 *
 * Built from `<span>`s (not `<div>`s) so it is valid PHRASING content: it renders
 * INSIDE a Markdown paragraph, right after the `<a>`, without an invalid
 * `<div>`-inside-`<p>` nesting. The flex layout still applies on spans.
 */
export function LinkPreview({ data }: { data: LinkPreviewData }) {
  let host = "";
  try {
    host = new URL(data.url).hostname.replace(/^www\./, "");
  } catch {
    host = data.url;
  }
  // Blurred background: the OG image, else the site icon — a soft brand wash instead
  // of flat grey. Both are `data:` URLs from the host (runtime value → the ONE
  // allowed inline style, like the <img> src below).
  const bg = data.image || data.favicon;
  return (
    <a href={data.url} target="_blank" rel="noreferrer noopener" className="link-preview">
      {bg && (
        <span
          className="link-preview-bg"
          aria-hidden="true"
          style={{ backgroundImage: `url("${bg}")` }}
        />
      )}
      {data.image && (
        // data: URL from the host (runtime value) — the only allowed inline attr.
        <img src={data.image} alt="" className="link-preview-img" loading="lazy" />
      )}
      <span className="link-preview-body">
        <span className="link-preview-site">{data.siteName || host}</span>
        {data.title && <span className="link-preview-title">{data.title}</span>}
        {data.description && <span className="link-preview-desc">{data.description}</span>}
      </span>
    </a>
  );
}
