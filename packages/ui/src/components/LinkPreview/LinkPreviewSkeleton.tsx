/**
 * Placeholder shown while an OpenGraph link preview is being fetched — same
 * footprint as {@link LinkPreview} (a thumbnail block + three text lines) with a
 * shimmer, so the card slot doesn't pop in once the fetch resolves. Built from
 * `<span>`s only (valid PHRASING content → it renders inside the Markdown `<p>`,
 * right after the `<a>`, like the real card). Non-interactive + aria-hidden.
 */
export function LinkPreviewSkeleton() {
  return (
    <span className="link-preview link-preview-skeleton" aria-hidden="true">
      <span className="link-preview-img sk-shimmer" />
      <span className="link-preview-body">
        <span className="sk-line sk-line-site sk-shimmer" />
        <span className="sk-line sk-line-title sk-shimmer" />
        <span className="sk-line sk-line-desc sk-shimmer" />
      </span>
    </span>
  );
}
