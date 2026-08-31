import { useT } from "../../../i18n";
/**
 * The loading placeholder shown BEFORE a document renders — a content-shaped shimmer
 * (not a spinner), so the viewer's layout doesn't jump when the bytes land. Reuses the
 * chat's `md-img-shimmer` keyframe. `variant` picks the silhouette: a page of text lines
 * (docs / PDF / text), a framed rectangle (images), or a few rows (spreadsheets). Shared
 * by every file viewer + the panel's initial file-meta resolve.
 */
export function FileSkeleton({ variant = "doc" }: { variant?: "doc" | "image" | "sheet" }) {
  const t = useT();
  if (variant === "image") {
    return (
      <div className="fv-skel fv-skel--image" aria-busy="true" aria-label={t.viewers.loadingFile}>
        <span className="fv-skel-shine" />
      </div>
    );
  }
  if (variant === "sheet") {
    return (
      <div className="fv-skel fv-skel--sheet" aria-busy="true" aria-label={t.viewers.loadingFile}>
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="fv-skel-row" />
        ))}
      </div>
    );
  }
  return (
    <div className="fv-skel fv-skel--doc" aria-busy="true" aria-label={t.viewers.loadingFile}>
      <span className="fv-skel-page">
        <span className="fv-skel-line fv-skel-title" />
        <span className="fv-skel-line" />
        <span className="fv-skel-line" />
        <span className="fv-skel-line" />
        <span className="fv-skel-line" />
        <span className="fv-skel-gap" />
        <span className="fv-skel-line" />
        <span className="fv-skel-line" />
        <span className="fv-skel-line" />
      </span>
    </div>
  );
}
