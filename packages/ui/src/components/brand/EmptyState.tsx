import type { ReactNode } from "react";

/** The six redaction-marker hues. `tone` picks the icon tile + point-chip glyphs. */
export type EmptyTone = "pink" | "amber" | "sky" | "lime" | "mint" | "violet";

/** A reassurance chip under the body — a glyph tile + a short label. */
export type EmptyPoint = { glyph: string; label: string; tone?: EmptyTone };

/**
 * The branded empty state (design-system `EmptyState`) — a highlight-marker icon tile,
 * a marker headline, an explanatory body and an optional row of points + a CTA.
 *
 * ⚠️ NO hatched backdrop. The kit still draws diagonal redaction stripes behind the
 * text; the app deliberately does not — they sat UNDER the one paragraph an empty state
 * exists to make read, and the dark themes already had to switch them off to keep it
 * legible. A texture that has to disappear in half the themes is decoration, not a
 * signature. Don't re-add it from the kit.
 *
 * First-run and no-match are the SAME component with different tones: first-run
 * explains what the surface is for and offers the action that fills it; no-match
 * wears the search tone and offers a way back out of the filter.
 */
export function EmptyState({
  icon,
  tone = "lime",
  eyebrow,
  title,
  body,
  cta,
  onCta,
  ctaIcon,
  points = [],
}: {
  icon: ReactNode;
  tone?: EmptyTone;
  eyebrow?: string;
  title: string;
  body: string;
  cta?: string;
  onCta?: () => void;
  ctaIcon?: ReactNode;
  points?: EmptyPoint[];
}) {
  return (
    <div className="om-empty om-step-in" data-tone={tone}>
      <div className="om-empty-tile">{icon}</div>
      {eyebrow && <div className="cv-eyebrow om-empty-eyebrow">{eyebrow}</div>}
      {/* Pas de `.om-mark` : le surlignage est la trace du redaction, et il ne dit rien
          d'une case vide. Sur une ligne entière il devenait une bande de couleur pleine
          derrière le seul titre — un aplat, pas une marque. */}
      <h3 className="cv-display om-empty-title">{title}</h3>
      <p className="om-empty-body">{body}</p>
      {points.length > 0 && (
        <div className="om-empty-points">
          {points.map((p) => (
            <span key={p.label} className="om-empty-point" data-tone={p.tone ?? tone}>
              <span className="om-empty-glyph" aria-hidden="true">
                {p.glyph}
              </span>
              {p.label}
            </span>
          ))}
        </div>
      )}
      {cta && onCta && (
        <div className="om-empty-cta">
          {/* `btn-inline` = inline-flex + align-items:center + gap, so the icon and the
              label sit on ONE line (a bare `btn-primary` is inline-block: the « + » broke
              onto its own line). */}
          <button type="button" className="btn-primary btn-inline" onClick={onCta}>
            {ctaIcon}
            {cta}
          </button>
        </div>
      )}
    </div>
  );
}
