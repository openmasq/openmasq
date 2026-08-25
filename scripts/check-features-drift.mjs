#!/usr/bin/env node
// FEATURES.md drift NUDGE — the half `check-features.mjs` can't do (root rule 13).
//
// `check-features.mjs` validates the CURRENT state (paths exist, counters match, every
// section/tab/screen/modal is named) — it has no notion of a commit or a diff, so it
// cannot catch a feature that shipped with real UI changes but no matching prose. Measured
// 2026-07-30: 20+ `feat` commits touched `packages/ui/src/{pages,memory,...}` without
// touching FEATURES.md in the same diff — the mechanical gate stayed green throughout
// because every path it already knew about was still valid.
//
// This script is a NUDGE, not a gate: it diffs the current branch against a base ref, and
// if FEATURE-SHAPED files changed without FEATURES.md changing alongside them, it prints a
// warning naming them. It NEVER fails the build — a doc reminder that blocks CI is worse
// than the drift it's trying to catch (a refactor with no user-facing change would false-
// positive constantly), and root rule 13 already has a real ratchet in check-features.mjs
// for the part that CAN be verified mechanically.
//
// Base ref resolution, in order: FEATURES_DRIFT_BASE env (CI sets this to the PR base SHA
// / previous push SHA) → merge-base with origin/main → merge-base with origin/dev →
// HEAD~1. Any failure (shallow clone, no such ref, detached HEAD with no history) means
// "can't tell" — the script prints nothing and exits 0, never crashes CI over its own
// plumbing.
import { execSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8" }).trim();

// Directories that are FEATURES.md's actual subject matter — a change here is either a
// new/changed capability or, often enough, worth a doc glance either way. Deliberately
// narrower than "anything under packages/ui/src": `agent/`, `send/`, `state/store.ts` are
// touched by nearly every change (routing, redaction, orchestration) and would make this
// fire on almost every PR, which is exactly the false-positive-fatigue failure mode a nudge
// must avoid. Under-catching here is the safe direction — the mechanical gate in
// check-features.mjs still catches a genuinely NEW screen/tab/setting/modal regardless.
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

function resolveBase() {
  const candidates = [
    process.env.FEATURES_DRIFT_BASE,
    () => run("git merge-base HEAD origin/main"),
    () => run("git merge-base HEAD origin/dev"),
    () => run("git rev-parse HEAD~1"),
  ];
  for (const c of candidates) {
    try {
      const ref = typeof c === "function" ? c() : c;
      if (ref) return ref;
    } catch {
      // Try the next candidate — a missing remote ref or a shallow clone is expected
      // in some environments, not a reason to fail.
    }
  }
  return null;
}

function main() {
  let base;
  try {
    base = resolveBase();
  } catch {
    base = null;
  }
  if (!base) return; // Can't determine a base — silently skip, never block.

  let changed;
  try {
    changed = run(`git diff --name-only ${base}...HEAD`).split("\n").filter(Boolean);
  } catch {
    return; // Same — a diff failure is a plumbing problem, not a doc problem.
  }
  if (!changed.length) return;

  const featureFiles = changed.filter(isFeatureFile);
  if (!featureFiles.length) return;
  if (changed.includes("FEATURES.md")) return; // Already touched it — nothing to nudge.

  console.warn(
    `\n⚠️  ${featureFiles.length} fichier(s) feature-shaped modifié(s) sans FEATURES.md dans le même diff :\n` +
      featureFiles.map((f) => `    ${f}`).join("\n") +
      `\n\n  Ce n'est PAS bloquant — juste un rappel (règle 13). Si ce changement ajoute ou\n` +
      `  modifie une capacité visible par l'utilisateur, une ligne dans FEATURES.md lui\n` +
      `  évite de disparaître. Si c'est du pur refactor interne, ignore ce message.\n`,
  );
}

main();
