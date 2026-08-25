import {
  siBaidu,
  siBytedance,
  siKuaishou,
  siMeituan,
  siMeta,
  siOllama,
  siOpenrouter,
  siPerplexity,
  siScaleway,
  siXiaomi,
} from "simple-icons";

/**
 * Authentic vendor marks for model families the hand-inlined `Glyph` set doesn't
 * cover, sourced from the `simple-icons` dependency already used for the MCP + search
 * logos (accurate official paths, CSP-safe inline SVG — no remote asset). Keyed by the
 * CANONICAL family key (`vendorKey.ts`). Only vendors `simple-icons` actually ships are
 * here; a vendor it never carried is vendored from that vendor's OWN icon in
 * `./vendorLogoImages.ts`, and only a vendor with neither stays a letter monogram —
 * never a fabricated mark.
 *
 * `openai-compat` is the "Local" family (Ollama-served local models), so it wears the
 * Ollama mark. `kwaipilot` is Kuaishou's team, so it wears Kuaishou's.
 */
export interface BrandMark {
  /** 24×24 single-path SVG. */
  path: string;
  /** Official brand colour, `#rrggbb`. */
  hex: string;
}

const FAMILY_BRANDS: Record<string, BrandMark> = {
  meta: { path: siMeta.path, hex: `#${siMeta.hex}` },
  perplexity: { path: siPerplexity.path, hex: `#${siPerplexity.hex}` },
  scaleway: { path: siScaleway.path, hex: `#${siScaleway.hex}` },
  "openai-compat": { path: siOllama.path, hex: `#${siOllama.hex}` },
  openrouter: { path: siOpenrouter.path, hex: `#${siOpenrouter.hex}` },
  bytedance: { path: siBytedance.path, hex: `#${siBytedance.hex}` },
  baidu: { path: siBaidu.path, hex: `#${siBaidu.hex}` },
  xiaomi: { path: siXiaomi.path, hex: `#${siXiaomi.hex}` },
  kuaishou: { path: siKuaishou.path, hex: `#${siKuaishou.hex}` },
  kwaipilot: { path: siKuaishou.path, hex: `#${siKuaishou.hex}` },
  meituan: { path: siMeituan.path, hex: `#${siMeituan.hex}` },
};

export function familyBrand(key: string): BrandMark | undefined {
  return FAMILY_BRANDS[key];
}
