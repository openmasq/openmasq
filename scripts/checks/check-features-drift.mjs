#!/usr/bin/env node
// Rule 13 NUDGE, never a gate: a diff that changes feature-carrying UI without touching the
// master file (FEATURES.md or a features/*.md section) gets a reminder on stderr. Exit 0
// always — a refactor legitimately trips it, and a base it cannot resolve is not a doc fault.
import { execSync } from "node:child_process";

const root = new URL("../..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8" }).trim();

const FEATURE_DIRS = [
  "packages/ui/src/pages/",
  "packages/ui/src/memory/",
  "packages/ui/src/containers/modals/",
  "packages/ui/src/privacy/",
  "packages/ui/src/competences/",
  "packages/ui/src/workflows/",
  "packages/ui/src/suggestions/",
  "packages/ui/src/avis/",
  "packages/ui/src/import/",
];
const isFeatureFile = (f) =>
  FEATURE_DIRS.some((d) => f.startsWith(d)) && !/\.test\.tsx?$/.test(f) && !f.endsWith(".css");
const isMasterFile = (f) => f === "FEATURES.md" || /^features\/[^/]+\.md$/.test(f);

function resolveBase() {
  const candidates = [
    () => process.env.FEATURES_DRIFT_BASE,
    () => run("git merge-base HEAD origin/main"),
    () => run("git merge-base HEAD origin/dev"),
    () => run("git rev-parse HEAD~1"),
  ];
  for (const c of candidates) {
    try {
      const ref = c();
      if (ref) return ref;
    } catch {}
  }
  return null;
}

function main() {
  const base = resolveBase();
  if (!base) return;
  let changed;
  try {
    changed = run(`git diff --name-only ${base}...HEAD`).split("\n").filter(Boolean);
  } catch {
    return;
  }
  const featureFiles = changed.filter(isFeatureFile);
  if (!featureFiles.length || changed.some(isMasterFile)) return;

  console.warn(
    `\n⚠️  ${featureFiles.length} feature-shaped file(s) changed without FEATURES.md / features/*.md in the same diff:\n` +
      featureFiles.map((f) => `    ${f}`).join("\n") +
      `\n\n  Not blocking (rule 13 reminder). A user-visible capability added or altered gets its\n` +
      `  line in the matching features/*.md section; pure internal refactoring can ignore this.\n`,
  );
}

main();
