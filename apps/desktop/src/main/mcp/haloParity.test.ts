import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PARITY (rule 9): the agent-browser drive halo (`browser/haloOverlay.ts`) must be THE
 * login page's aurora (`packages/ui/src/styles/auth/card.css` `.om-aurora`) — same hues,
 * same gradient recipe, same drift. The halo is a static `data:` page in main that cannot
 * import the renderer's CSS, so the values are pinned by copy — and copies drift, which is
 * exactly what this test forbids: re-tone the login aurora (or the `:root` tokens it
 * reads) and this fails until the halo follows.
 *
 * Lives in `mcp/` (not `mcp/browser/`) because the vitest `include` does not cover new
 * subfolders — a test there would silently never run.
 */

const repo = join(__dirname, "..", "..", "..", "..", "..");
const halo = readFileSync(join(__dirname, "browser", "haloOverlay.ts"), "utf-8");
const card = readFileSync(join(repo, "packages/ui/src/styles/auth/card.css"), "utf-8");
const styles = readFileSync(join(repo, "packages/ui/src/styles.css"), "utf-8");

/** Whitespace-insensitive CSS compare: strip spaces/newlines, drop trailing `;` in blocks. */
const norm = (s: string): string => s.replace(/\s+/g, "").replace(/;}/g, "}");

/** The FIRST definition of a token in styles.css is the `:root` base (the later ones are
 *  theme re-points — the login screen renders on the base theme by default). */
function rootToken(name: string): string {
  const m = styles.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`token ${name} not found in styles.css`);
  return m[1].toLowerCase();
}

describe("drive halo ⇄ login aurora parity", () => {
  const mint = rootToken("--hl-mint");
  const sky = rootToken("--hl-sky");

  it("the pinned hexes ARE the :root tokens the login aurora reads", () => {
    expect(halo.toLowerCase()).toContain(mint);
    expect(halo.toLowerCase()).toContain(sky);
  });

  it("the four radial plumes match the login's, hue for hue, stop for stop", () => {
    const block = card.match(/\.om-aurora\s*{([\s\S]*?)\n}/)?.[1];
    expect(block, ".om-aurora block in auth/card.css").toBeTruthy();
    const background = block!.match(/background:\s*([\s\S]*?);/)?.[1];
    expect(background, ".om-aurora background declaration").toBeTruthy();
    const expected = norm(
      background!.replace(/var\(--hl-mint\)/g, mint).replace(/var\(--hl-sky\)/g, sky),
    );
    expect(norm(halo.toLowerCase())).toContain(expected.toLowerCase());
  });

  it("same drift: the om-aurora-kf keyframes are copied verbatim", () => {
    const kf = card.match(/@keyframes om-aurora-kf\s*{([\s\S]*?)\n}/)?.[1];
    expect(kf, "om-aurora-kf keyframes in auth/card.css").toBeTruthy();
    expect(norm(halo)).toContain(norm(kf!));
  });

  it("same veil: blur and opacity match the login values", () => {
    const blur = card.match(/\.om-aurora\s*{[\s\S]*?blur\((\d+px)\)/)?.[1];
    expect(blur).toBeTruthy();
    expect(halo).toContain(`blur(${blur})`);
    const opacity = card.match(/\.om-aurora\s*{[\s\S]*?opacity:\s*([\d.]+)/)?.[1];
    const haloOpacity = halo.match(/opacity:\s*([\d.]+)/)?.[1];
    // `0.85` (css convention) vs `.85` (the compact data: page) are the same value.
    expect(Number(haloOpacity)).toBe(Number(opacity));
  });
});
