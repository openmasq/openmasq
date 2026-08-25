import type { ProviderId } from "@openmasq/llm";
import { Glyph } from "./Glyph";
import { glyphForFamily, glyphForModel, glyphForProvider, PLATE_BG, TILE_BG, type GlyphKey } from "./glyphKeys";
import { familyBrand, type BrandMark } from "./familyBrands";
import { vendorLogo, type VendorLogo } from "./vendorLogoImages";
import { canonicalVendorKey, vendorPrefix } from "../../../prompt/vendorKey";

/** A resolved vendor mark: a hand-inlined `Glyph`, an authentic `simple-icons` brand
 *  path, or the vendor's own icon vendored as a `data:` URL. */
export type Mark =
  | { kind: "glyph"; glyph: GlyphKey }
  | { kind: "brand"; brand: BrandMark }
  | { kind: "image"; logo: VendorLogo };

/** The mark for a canonical vendor key, tried in mark-quality order: our own art, then
 *  a `simple-icons` path, then the vendor's vendored icon. Null → no mark held. */
function vendorMark(key: string): Mark | null {
  const g = glyphForFamily(key);
  if (g) return { kind: "glyph", glyph: g };
  const b = familyBrand(key);
  if (b) return { kind: "brand", brand: b };
  const l = vendorLogo(key);
  if (l) return { kind: "image", logo: l };
  return null;
}

/**
 * The mark for a MODEL (picker cards + conversation gutter). Resolution order:
 * 1. the id's OWN vendor by substring (a Scaleway-hosted DeepSeek/Qwen/… shows
 *    its real mark);
 * 2. an aggregator vendor PREFIX (OpenRouter `anthropic/claude…` → Claude, `openai/…`
 *    → ChatGPT) resolved through `vendorMark` — the fix for OpenRouter cards that used
 *    to fall through to the pearl;
 * 3. the provider glyph (pearl for local/unknown).
 */
export function modelMark(provider: ProviderId, modelId?: string): Mark {
  if (modelId) {
    const own = glyphForModel(modelId);
    if (own) return { kind: "glyph", glyph: own };
    const prefix = vendorPrefix(modelId);
    if (prefix) {
      const m = vendorMark(canonicalVendorKey(prefix));
      if (m) return m;
    }
  }
  return { kind: "glyph", glyph: glyphForProvider(provider) };
}

/** The mark for a canonical FAMILY key (the picker's family chips). Null when we hold
 *  no vendor mark → the caller shows a letter monogram. */
export function familyMark(key: string): Mark | null {
  return vendorMark(key);
}

/** The tile background a mark sits on. A glyph wears its vendor's pastel; a dark-ink
 *  vendored icon needs a light plate or it vanishes in the dark theme; anything else
 *  is carried by its own colour on the neutral sunken tile. */
export function markBackground(mark: Mark): string {
  if (mark.kind === "glyph") return TILE_BG[mark.glyph];
  if (mark.kind === "image" && mark.logo.plate) return PLATE_BG;
  return "var(--surface-sunken)";
}

/** The mark art at a raw pixel size. `plated` says the caller already painted
 *  `markBackground` behind it (the tile does); a bare mark plates itself. */
export function MarkArt({ mark, px, plated = false }: { mark: Mark; px: number; plated?: boolean }) {
  if (mark.kind === "image") {
    const img = <img src={mark.logo.src} width={px} height={px} alt="" className="cv-icon" />;
    if (plated || !mark.logo.plate) return img;
    return (
      <span className="model-mark-plate" style={{ background: PLATE_BG }}>
        {img}
      </span>
    );
  }
  if (mark.kind === "brand") {
    return (
      <svg width={px} height={px} viewBox="0 0 24 24" fill={mark.brand.hex} className="cv-icon">
        <path d={mark.brand.path} />
      </svg>
    );
  }
  return <Glyph kind={mark.glyph} px={px} />;
}

/** The mark inside a rounded brand tile (conversation gutter + pickers). */
export function MarkTile({ mark, size }: { mark: Mark; size: number }) {
  return (
    <span className="model-tile" style={{ width: size, height: size, background: markBackground(mark) }}>
      <MarkArt mark={mark} px={Math.round(size * 0.62)} plated />
    </span>
  );
}
