#!/usr/bin/env node
// A GitHub Action referenced by TAG (`actions/checkout@v4`) is a MUTABLE pointer: whoever
// controls the action's repository can re-point `v4` at new code, and that code then runs
// in our CI with whatever secrets the job holds — signing certs, store credentials, the
// Vercel and Neon tokens. Pinning to a commit SHA makes the reference immutable; the
// trailing `# v4` comment is what a human (or Dependabot) reads to know what it tracks.
//
// This is the same class of hardening as `minimumReleaseAge` in pnpm-workspace.yaml, one
// layer up: that one gates what enters the lockfile, this one gates what runs the CI.
//
// A pinned SHA is not automatically UPDATED, which is the trade: bumping is a deliberate
// commit. Dependabot understands SHA pins with a version comment and opens that PR itself.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".github/workflows");

/** `uses:` values that are NOT third-party code: a local composite action (`./…`) and a
 *  reusable workflow in this same repository (`./.github/workflows/…`) are already pinned
 *  by the commit that runs them. Docker refs (`docker://…`) carry their own digest rules. */
const isLocal = (ref) => ref.startsWith("./") || ref.startsWith("docker://");

const SHA = /^[0-9a-f]{40}$/;
const problems = [];
let pinned = 0;

/** ⚠️ The `secrets` context is FORBIDDEN inside an `if:` — neither on a job nor on a
 *  step. GitHub does not report it at run time: it refuses to LOAD the workflow, and the
 *  run appears failed WITH ZERO JOBS. A whole release (mac included) fell that way over a
 *  condition that only concerned Windows, and nothing local had seen it — hence this rule,
 *  added to the guard that already reads every workflow. The workaround is one line: pass
 *  the secret through the job's `env:`, which `if:` can read. */
const secretInIf = (line) => /^\s*if:\s*.*\bsecrets\./.test(line);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
  const lines = readFileSync(join(dir, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (secretInIf(line)) {
      problems.push(
        `${file}:${i + 1} \`secrets\` inside an \`if:\` — the workflow does not LOAD (0 jobs): ${line.trim()}`,
      );
    }
    const m = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
    if (!m) return;
    const ref = m[1];
    if (isLocal(ref)) return;
    const at = ref.lastIndexOf("@");
    const rev = at === -1 ? "" : ref.slice(at + 1);
    if (SHA.test(rev)) {
      pinned++;
      if (!/#\s*\S/.test(line.slice(m[0].length))) {
        problems.push(`${file}:${i + 1} pinned but unlabelled — add a trailing \`# <tag>\`: ${ref}`);
      }
      return;
    }
    problems.push(`${file}:${i + 1} not pinned to a commit SHA: ${ref}`);
  });
}

if (problems.length) {
  console.error(`\n✗ Workflows to fix (${problems.length}):`);
  for (const p of problems) console.error(`    ${p}`);
  console.error(
    `\n  A tag is mutable: the action's owner can re-point it at code that runs in our CI\n` +
      `  with the job's secrets. Resolve the tag once and pin the result:\n\n` +
      `      gh api repos/<owner>/<repo>/commits/<tag> --jq .sha\n\n` +
      `  then write \`uses: <owner>/<repo>@<sha> # <tag>\`.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ Every GitHub Action is pinned to a commit SHA (${pinned} references).`);
process.exit(0);
