import type { HostCountry, HostCode } from "@openmasq/llm";

/**
 * A small hosting-jurisdiction mark shown next to a model's provider — so a
 * privacy-first user sees the data-residency at a glance. Drawn as inline SVG
 * (crisp everywhere AND Windows-safe — Windows renders flag EMOJI as bare
 * two-letter boxes, so we never use them). Country flags carry FIXED brand-accurate
 * hex (a flag IS its colours — data, not theming), while the neutral glyphs
 * (`global` gateway, `local` machine) use `currentColor` to follow the theme.
 *
 * Renders nothing when the provider declares no `hostCountry` (honest = unknown).
 */
export function CountryFlag({ host, size = 13 }: { host?: HostCountry; size?: number }) {
  if (!host) return null;
  return (
    <span className={`country-flag cf-${host.code}`} title={host.label} aria-label={host.label} role="img">
      <FlagSvg code={host.code} size={size} />
    </span>
  );
}

function FlagSvg({ code, size }: { code: HostCode; size: number }) {
  // Rectangular flags render at a ~1.45:1 ratio; the neutral glyphs are square.
  if (code === "FR") {
    const w = Math.round(size * 1.45);
    return (
      <svg width={w} height={size} viewBox="0 0 20 14" aria-hidden="true">
        <rect x="0" y="0" width="6.67" height="14" fill="#0055A4" />
        <rect x="6.67" y="0" width="6.66" height="14" fill="#FFFFFF" />
        <rect x="13.33" y="0" width="6.67" height="14" fill="#EF4135" />
      </svg>
    );
  }
  if (code === "US") {
    const w = Math.round(size * 1.45);
    // Simplified at this size: 7 red + 6 white stripes, a blue canton, star dots.
    const stripes = Array.from({ length: 6 }, (_, i) => (
      <rect key={i} x="0" y={2 + i * 2} width="20" height="1" fill="#FFFFFF" />
    ));
    const stars = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        stars.push(<circle key={`${r}-${c}`} cx={1.3 + c * 2.4} cy={1.4 + r * 2.1} r="0.5" fill="#FFFFFF" />);
    return (
      <svg width={w} height={size} viewBox="0 0 20 14" aria-hidden="true">
        <rect x="0" y="0" width="20" height="14" fill="#B22234" />
        {stripes}
        <rect x="0" y="0" width="8.2" height="7" fill="#3C3B6E" />
        {stars}
      </svg>
    );
  }
  if (code === "CN") {
    const w = Math.round(size * 1.45);
    // Red field with the large star + four small stars in the canton (simplified).
    const small = [
      [6.2, 1.4],
      [7.6, 2.8],
      [7.6, 4.6],
      [6.2, 6],
    ];
    return (
      <svg width={w} height={size} viewBox="0 0 20 14" aria-hidden="true">
        <rect x="0" y="0" width="20" height="14" fill="#DE2910" />
        <circle cx="3.2" cy="3.4" r="1.9" fill="#FFDE00" />
        {small.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="0.6" fill="#FFDE00" />
        ))}
      </svg>
    );
  }
  if (code === "global") {
    // A neutral globe (meridian + parallels) — a multi-region gateway, not a country.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </svg>
    );
  }
  // local: a monitor (this runs on the user's own machine).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </svg>
  );
}
