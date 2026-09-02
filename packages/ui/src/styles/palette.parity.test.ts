import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStylesheet } from "./readStylesheet";
import { describe, it, expect } from "vitest";
import { SECTION_HUE, REDACTION_SECTIONS, CATEGORY_HUE, CATEGORY_SECTION } from "@openmasq/redact";

/**
 * The redaction palette has ONE source — `SECTION_HUE` — and every other surface must
 * derive from it. Deriving is enforced by the type system where the code can import that
 * source; this file covers the two places it CANNOT:
 *
 *  1. the stylesheet, which has to declare a real colour per hue (and its ink, and its soft
 *     tint) — a hue with no token renders an uncoloured mark;
 *  2. the console logger, which cannot reference a CSS variable from a `%c` style.
 *
 * Each of those is a literal copy by necessity. Rule 9's answer to a necessary copy is a
 * parity TEST, not a "keep in sync" comment — the comments were there, and the palettes had
 * drifted anyway.
 */
// The RESOLVED sheet (styles.css + its `styles/` partials): reading styles.css alone
// made this sweep blind to every family already peeled out — see `readStylesheet.ts`.
const CSS = readStylesheet();

const HUES = [...new Set(Object.values(SECTION_HUE))];

/** The LAST declaration of `--name` in a stylesheet (later wins), as written. */
function declared(css: string, name: string): string | undefined {
  const all = [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, "g"))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
}

describe("redaction palette — one source, no drift", () => {
  it("gives every section a hue, and every hue a fill + ink + soft tint in styles.css", () => {
    for (const section of REDACTION_SECTIONS) {
      expect(SECTION_HUE[section], `${section} has no hue`).toBeTruthy();
    }
    for (const hue of HUES) {
      expect(declared(CSS, `--hl-${hue}`), `--hl-${hue} is not declared`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(declared(CSS, `--ink-on-hl-${hue}`), `--ink-on-hl-${hue} is not declared`).toBeTruthy();
      expect(declared(CSS, `--hl-${hue}-soft`), `--hl-${hue}-soft is not declared`).toBeTruthy();
    }
  });

  it("resolves a `.hl-<hue>` class for every hue — the ONE hue → token map", () => {
    // A surface paints by adding `hl-<hue>` and reading `--mk`. A hue missing from that map
    // renders a mark with no fill at all, which is worse than a wrong colour: it looks like
    // nothing was redacted.
    for (const hue of HUES) {
      expect(CSS, `.hl-${hue} has no rule`).toMatch(
        new RegExp(`\\.hl-${hue}\\s*\\{[^}]*--mk\\s*:\\s*var\\(--hl-${hue}\\)`),
      );
    }
  });

  it("keeps the console logger's baked hexes equal to the tokens", () => {
    // The devtools console has no stylesheet; `state/wireTrace.ts` therefore holds literals.
    const debug = readFileSync(new URL("../state/debug/wireTrace.ts", import.meta.url), "utf8");
    for (const hue of HUES) {
      const baked = debug.match(new RegExp(`${hue}:\\s*"(#[0-9a-f]{6})"`, "i"))?.[1];
      expect(baked, `wireTrace.ts has no hex for ${hue}`).toBeTruthy();
      expect(baked!.toLowerCase(), `wireTrace.ts ${hue}`).toBe(declared(CSS, `--hl-${hue}`)!.toLowerCase());
    }
  });

  it("colours a category exactly as its section — the derivation, asserted", () => {
    // `CATEGORY_HUE` is computed, so this cannot fail by editing a colour. It CAN fail if
    // someone re-declares it as a literal map, which is the regression worth pinning.
    for (const [category, section] of Object.entries(CATEGORY_SECTION)) {
      expect(CATEGORY_HUE[category as keyof typeof CATEGORY_HUE], category).toBe(
        SECTION_HUE[section],
      );
    }
  });

  it("keeps the nine hues distinct — two sections sharing a fill merges them", () => {
    const fills = HUES.map((h) => declared(CSS, `--hl-${h}`)!.toLowerCase());
    expect(new Set(fills).size, fills.join(" ")).toBe(HUES.length);
  });

  it("no theme re-tones the palette — one colour per hue, every ground", () => {
    // A theme that re-toned `--hl-*` meant the same section wore two colours depending on
    // the ground. Theme the ground and the accents; leave the redaction palette alone.
    for (const theme of ['[data-theme="dark"]']) {
      for (const hue of HUES) {
        const block = CSS.split(theme).slice(1).join(theme);
        const scoped = new RegExp(`^[^}]*--hl-${hue}\\s*:`, "m");
        expect(block.split("}")[0] ?? "", `${theme} re-tones --hl-${hue}`).not.toMatch(scoped);
      }
    }
  });
});

/**
 * A redaction mark takes its hue from the ONE map, `.hl-<hue>` — never from a
 * `tone-<hue>` class, which several per-surface families define for THEMSELVES and which
 * maps nothing for a mark. The failure is silent and total: `--mk-soft` stays unset, the
 * fill falls back to a near-invisible slate, and the surface simply looks un-highlighted.
 *
 * That is precisely what had happened to the spreadsheet grid — a CSV opened in the file
 * viewer showed no redaction at all while the chat and the PDF showed theirs. Scanning
 * the source is the only place this can be caught: it typechecks, it renders, and no
 * screenshot test would call a missing colour a failure.
 */
describe("a redaction mark always carries an `hl-` hue", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(SRC);

  it("no source emits `redaction-mark` next to a `tone-` class", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (line.includes("redaction-mark") && /tone-\$\{|tone-[a-z]/.test(line)) {
          offenders.push(`${f.slice(SRC.length + 1)}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
