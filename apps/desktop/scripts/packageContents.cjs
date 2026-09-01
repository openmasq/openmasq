// What the SHIPPED app is allowed to contain — re-read on the produced asar, not on the config.
//
// ⛔ WHY THIS FILE EXISTS. `electron-builder.cjs`'s allowlist (`files`) can stop
// applying without anything turning red: a list of strings in `mac.files` takes the
// place of the main matcher and electron-builder falls back to `**/*`. The app packages,
// starts and behaves normally — it is just bigger than what its config
// describes, and nothing in the build says so. This is the class of defect a setting cannot
// hold onto, because a setting is an INTENTION.
//
// The guard is therefore here, on the ARTIFACT, and it fails CLOSED (rule 7): an entry outside
// the allowlist breaks packaging. It runs inside `afterPack.cjs`, i.e. for mac AND
// Windows, on ALL paths (`package`, `dist`, `release`, CI), and before signing.
//
// ⚠️ ALLOWLIST, never a denylist. Forbidding `src/` and `.env` by name would let the
// next folder we add to `apps/desktop/` through. We enumerate what is PERMITTED.
"use strict";

/**
 * The only roots the app's app.asar must contain.
 *
 * `out/`: the bundles (main, preload, renderer) produced by electron-vite.
 * `package.json`: read by Electron at startup (name, version, `main`).
 * `node_modules/`: the production dependencies, filtered by electron-builder's
 *   own dedicated matcher (its `!…` patterns do the sorting there, not this table).
 */
const ALLOWED_ROOTS = ["out", "node_modules", "package.json"];

/**
 * What remains forbidden INSIDE an allowed root.
 *
 * A `.map` from OUR bundles embeds `sourcesContent`: the original TypeScript, verbatim.
 * Shipping it undoes the minification and delivers the explanation along with the code — see
 * `electron.vite.config.ts`. The vendored dependencies' maps are not affected:
 * they describe code that's already public.
 */
const FORBIDDEN_WITHIN = [
  {
    test: (entry) => entry.startsWith("out/") && entry.endsWith(".map"),
    why: "sourcemap de nos bundles — elle contient le TypeScript d'origine (`sourcesContent`)",
  },
];

/** The first segment of an asar entry (`/out/main/index.js` → `out`). */
function rootOf(entry) {
  return entry.replace(/^\/+/, "").split("/")[0];
}

/**
 * The entries that have no business in the app. Pure (no disk access) so it can be pinned
 * by `packageContents.test.ts`: it's the table that decides, and a wrong table is
 * precisely what a build doesn't say.
 *
 * @param {string[]} entries paths listed in the asar (`/out/main/index.js`, `/.env`, …)
 * @returns {{entry: string, why: string}[]}
 */
function findPackagingViolations(entries) {
  const violations = [];
  for (const raw of entries) {
    const entry = raw.replace(/^\/+/, "");
    if (entry === "") continue;
    const root = rootOf(entry);
    if (!ALLOWED_ROOTS.includes(root)) {
      violations.push({ entry, why: `\`${root}\` n'est pas une racine permise` });
      continue;
    }
    const forbidden = FORBIDDEN_WITHIN.find((f) => f.test(entry));
    if (forbidden) violations.push({ entry, why: forbidden.why });
  }
  return violations;
}

/**
 * The failure message: GROUPED by root. A leak counts in the hundreds of entries, and
 * nine hundred lines in a CI log hide the diagnosis instead of giving it.
 */
function formatViolations(violations) {
  const byWhy = new Map();
  for (const v of violations) {
    const bucket = byWhy.get(v.why) ?? [];
    bucket.push(v.entry);
    byWhy.set(v.why, bucket);
  }
  const lines = [];
  for (const [why, entries] of byWhy) {
    const sample = entries.slice(0, 3).join(", ");
    const rest = entries.length > 3 ? `, … (+${entries.length - 3})` : "";
    lines.push(`  • ${entries.length} entrée(s) — ${why}\n      ${sample}${rest}`);
  }
  return lines.join("\n");
}

/** FAIL CLOSED: breaks packaging if the app contains anything other than its allowlist. */
function assertPackagedContents(entries) {
  const violations = findPackagingViolations(entries);
  if (violations.length === 0) return;
  throw new Error(
    `packageContents: ${violations.length} entrée(s) interdite(s) dans l'app.asar —\n` +
      `${formatViolations(violations)}\n\n` +
      `  L'allowlist \`files\` d'electron-builder.cjs ne s'applique plus. La cause connue :\n` +
      `  \`mac.files\`/\`win.files\` écrit en liste de CHAÎNES au lieu de la forme \`- filter:\`\n` +
      `  (le commentaire du bloc \`mac.files\` explique le mécanisme). Empaquetage interrompu :\n` +
      `  ces fichiers partiraient chez l'utilisateur.`,
  );
}

module.exports = { ALLOWED_ROOTS, findPackagingViolations, formatViolations, assertPackagedContents };
