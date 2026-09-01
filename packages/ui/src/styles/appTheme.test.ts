import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { readStylesheet } from "./readStylesheet";

/**
 * EVERY surface that loads this sheet must NAME its theme.
 *
 * `styles.css` declares the light skeleton under the BARE `:root` — the GREEN skin, retired
 * from the product (`state/theme.ts`: `blueAccent` translates any persisted theme to indigo) —
 * and the real accent under `[data-theme]`. The desktop app sets the attribute before the first
 * render (`applyPersistedTheme`), which makes the skeleton unreachable AT HOME. The
 * web consoles, though, never mount this store: with no attribute on `<html>` they
 * rendered green (forest brand, lemon ink, green links and focus) against
 * indigo kits. Nothing in their code could say so — hence this test, and its sole home here,
 * next to the tokens it talks about (apps don't import each other, a test placed
 * in one couldn't have covered the other).
 *
 * It reads the TEXT of the root documents: the attribute there is a literal, and rendering it
 * would teach nothing more than reading it.
 */
const CSS = readStylesheet();

/** Each console's root document — the one that carries `<html>`.
 *  ⚠️ The console has lived in the private `infra` repo since 31/08/2026: when it isn't
 *  alongside (the public repo), there's nothing to read, and the test declares itself skipped rather
 *  than break on an ENOENT — a test that fails for a reason that isn't its own
 *  ends up disabled. */
const ROOTS = (
  [["apps/web (console d'administration)", "../../../../apps/web/index.html"]] as const
).filter(([, path]) => existsSync(new URL(path, import.meta.url)));

/** The LAST `--name` declared in a block of CSS (later wins), lowercased. */
function declared(css: string, name: string): string | undefined {
  const all = [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, "g"))];
  return all.length ? all[all.length - 1][1].trim().toLowerCase() : undefined;
}

/** The body of the bare `[data-theme="<name>"] { … }` rule, not its descendant rules. */
function themeBlock(name: string): string {
  return new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
}

describe.skipIf(ROOTS.length === 0)("les consoles nomment leur thème", () => {
  describe.each(ROOTS)("%s — l'accent du produit", (_label, path) => {
  const src = readFileSync(new URL(path, import.meta.url), "utf8");
  const theme = /<html[^>]*\sdata-theme="([^"]+)"/.exec(src)?.[1];

  it("pose un `data-theme` sur <html>", () => {
    expect(theme, "aucun data-theme : la console rendrait le squelette vert").toBeTruthy();
    expect(theme).not.toBe("light");
  });

  it("nomme un thème que la feuille déclare, et cet accent n'est pas le vert", () => {
    const block = themeBlock(theme!);
    expect(block, `[data-theme="${theme}"] n'existe pas dans styles.css`).not.toBe("");
    // The product's indigo accent. Hardcoded: it's the VALUE we want to see arrive
    // on screen, and reading it back from the same `:root` would prove nothing (the
    // green skeleton would satisfy its own declaration).
    expect(declared(block, "--brand")).toMatch(/^#3939fa$/);
  });
});
});
