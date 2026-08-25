import { MCP_LOGOS } from "./mcpLogos";
import { MCP_LOGO_IMAGES } from "./mcpLogoImages";

/**
 * The connector's square glyph: its official brand logo on a neutral tile, or
 * the initial on the connector's highlight hue. Shared by the Settings grid
 * card (38px), the detail-modal head (`lg`, 44px), the empty-thread starters
 * (`md`, 30px), the chat's integration proposal and the Workflows' server chips
 * (`sm`, 20px) — a shared leaf, hence `components/media/` (promotion-by-reuse).
 *
 * A logo is a single-path monochrome glyph (`MCP_LOGOS`, from `simple-icons`)
 * OR a raster favicon inlined as a `data:` URL (`MCP_LOGO_IMAGES`, for brands
 * `simple-icons` never carried). Both sit on the same neutral `.mcp-ctile-logo`
 * tile; the initial-on-hue tile is the last resort (browser/filesystem/demo).
 *
 * ⚠️ It uses `.mcp-ctile`, NOT the app-wide `.mcp-tile` — that one is also worn
 * by the credit action cards and the chat's integration suggestions, so styling
 * it here would move surfaces this tab doesn't own (see styles/mcp.css).
 */
export function McpTile({
  id,
  name,
  tone,
  lg,
  md,
  sm,
}: {
  id: string;
  name: string;
  tone: string;
  lg?: boolean;
  /** 30px tile — the size of the empty-thread starters' neutral `.om-starter-tile`,
   *  so an integration card and a universal one line up to the pixel. */
  md?: boolean;
  /** 20px chip-sized tile (the Workflows' server chips + card avatars). */
  sm?: boolean;
}) {
  const logo = MCP_LOGOS[id];
  const img = MCP_LOGO_IMAGES[id];
  const size = lg ? "mcp-ctile lg" : md ? "mcp-ctile md" : sm ? "mcp-ctile sm" : "mcp-ctile";
  if (logo)
    return (
      <span className={`${size} mcp-ctile-logo`}>
        <svg viewBox="0 0 24 24" fill={logo.hex} aria-hidden="true">
          <path d={logo.path} />
        </svg>
      </span>
    );
  if (img)
    return (
      <span className={`${size} mcp-ctile-logo`}>
        <img className="mcp-ctile-img" src={img} alt="" aria-hidden="true" />
      </span>
    );
  // The hue is per-connector DATA (`tone`), so it can't be a static class.
  return (
    <span className={size} style={{ background: `var(--hl-${tone})` }}>
      {name[0]}
    </span>
  );
}
