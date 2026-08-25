import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE stylesheet as the browser sees it: `styles.css` with its `@import "./styles/…"`
 * partials INLINED, comments stripped.
 *
 * Every CSS invariant test (`contrast`, `textContrast`, `palette.parity`) used to read
 * `styles.css` alone. That silently made each of them blind to the ~35 families already
 * peeled into `styles/` — so the WCAG-AA contrast sweep (root rule 12) and the
 * hue-parity pins covered a shrinking fraction of the app, and shrank further with every
 * extraction. Reading the resolved sheet makes the peel and the safety net independent,
 * which is what lets `styles.css` keep shrinking.
 *
 * Comments are stripped up front, not per-selector: the section banners contain commas
 * and braces, and leaving them in makes any selector split lie.
 */
export function readStylesheet(): string {
  return inlineImports(rootFile(), new Set()).replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The same sheet as a per-file list, RAW (comments kept) — for the sweeps that must
 * name the offending file and honour an in-comment derogation marker, which the
 * comment-stripped `readStylesheet()` cannot carry (`frozenInk.test.ts`).
 */
export function stylesheetFiles(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const seen = new Set<string>();
  const walk = (file: string): void => {
    if (seen.has(file)) return; // a partial imported twice contributes once
    seen.add(file);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return; // a Tailwind/package import (`tailwindcss`, a bare specifier) — not ours
    }
    out.push({ file, text });
    for (const m of text.matchAll(/@import\s+"([^"]+)"\s*;/g)) {
      if (m[1].startsWith(".")) walk(resolve(dirname(file), m[1]));
    }
  };
  walk(rootFile());
  return out;
}

function rootFile(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css");
}

function inlineImports(file: string, seen: Set<string>): string {
  if (seen.has(file)) return ""; // a partial imported twice contributes once
  seen.add(file);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return ""; // a Tailwind/package import (`tailwindcss`, a bare specifier) — not ours
  }
  return text.replace(/@import\s+"([^"]+)"\s*;/g, (whole, spec: string) =>
    spec.startsWith(".") ? inlineImports(resolve(dirname(file), spec), seen) : whole,
  );
}
