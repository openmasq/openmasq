/**
 * Dependency-audit CI gate — fails ONLY on advisories that matter for a shipped
 * or internet-facing surface, so the signal isn't drowned by dev/build/test noise.
 *
 * A finding is GATED (→ fail the build) when ALL of:
 *   1. severity is `high` or `critical`, AND
 *   2. at least one of its dependency paths roots in a SHIPPED/SERVED workspace, AND
 *   3. that path's DIRECT dependency is not a known build/test/CI tool.
 *
 * Everything else (dev tooling like electron-builder/vitest/wrangler/vite, or a
 * non-served workspace like react-email's bundled Next) is reported
 * as IGNORED and never fails the build.
 *
 * Rationale + the full triage live in the dependency-audit report. Re-tune the two
 * lists below as the topology changes. Runs `pnpm audit --json` itself.
 *
 *   node scripts/audit-gate.mjs        # or: pnpm audit:gate
 *
 * Exit codes: 0 = clean (or an infra/parse failure — we fail OPEN on registry
 * flake so a network hiccup never blocks every PR); 1 = real gated findings.
 */
import { spawnSync } from "node:child_process";

/** Workspaces whose runtime dependencies reach a user (shipped) or the network
 *  (served). Paths from `pnpm audit` encode `/` as `__` (e.g. `apps__desktop`);
 *  we normalise back to `apps/desktop`. NOTE: apps/landing left this monorepo for
 *  its own repo (18/08) — it isn't even a workspace member here anymore, so this
 *  set never needed to name it. */
const SERVED_WORKSPACES = new Set([
  "apps/desktop", // Electron app shipped to users
  "apps/api", // MCP broker sidecar (runs on the user's machine)
  "apps/backend", // Express API (served)
  "apps/web", // Next SSR admin console + API (served)
  "apps/updates", // Cloudflare Worker (internet-facing)
  "apps/analytics-fn", // Scaleway function (internet-facing)
  "apps/auth", // OAuth relay function (internet-facing)
  "apps/gateway", // redact-fn container (internet-facing)
]);

/** Direct deps that are build/test/CI tooling — a vuln here never ships in a
 *  runtime artifact, so it must not gate. Matched against the SECOND path segment
 *  (the top-level dep of the workspace). `electron` is deliberately ABSENT — it is
 *  a devDependency by convention but IS the shipped desktop runtime. */
const DEV_TOOL_ROOTS = new Set([
  "electron-builder", "app-builder-lib", "@electron/rebuild", "@electron/notarize",
  "vite", "@vitejs/plugin-react", "vitest", "@vitest/ui", "@vitest/coverage-v8",
  "esbuild", "tsup", "tsx", "typescript", "ts-node",
  "wrangler", "@cloudflare/vitest-pool-workers", "miniflare",
  "@playwright/test", "playwright", "playwright-core",
  "react-email", "@react-email/preview-server",
  "turbo", "eslint", "prettier", "@biomejs/biome", "oxlint",
  "tailwindcss", "@tailwindcss/vite", "postcss-cli", "autoprefixer",
  "jest", "nodemon", "concurrently", "cross-env", "rimraf", "npm-run-all",
  "@babel/cli", "rollup", "webpack",
]);

const GATED_SEVERITIES = new Set(["high", "critical"]);

/** `apps__desktop>express>path-to-regexp` → { workspace:"apps/desktop", direct:"express" } */
function parsePath(p) {
  const segs = String(p).split(">").map((s) => s.trim()).filter(Boolean);
  const workspace = (segs[0] || "").replace(/__/g, "/");
  const direct = segs[1] || "";
  return { workspace, direct, chain: segs.join(" › ") };
}

function runAudit() {
  const r = spawnSync("pnpm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "").trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    // pnpm can emit NDJSON on some versions — take the last complete object.
    const lines = out.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {}
    }
    return null;
  }
}

function main() {
  const data = runAudit();
  if (!data || !data.advisories) {
    console.warn("audit-gate: could not obtain a parseable `pnpm audit --json` result — failing OPEN (registry flake shouldn't block every PR).");
    process.exit(0);
  }

  const advisories = Object.values(data.advisories);
  const gated = [];
  let ignoredDevOrNonServed = 0;

  for (const a of advisories) {
    if (!GATED_SEVERITIES.has(a.severity)) continue;
    const paths = [...new Set((a.findings || []).flatMap((f) => f.paths || []))];
    const hits = paths
      .map(parsePath)
      .filter((p) => SERVED_WORKSPACES.has(p.workspace) && !DEV_TOOL_ROOTS.has(p.direct));
    if (hits.length) {
      gated.push({ sev: a.severity, mod: a.module_name, title: a.title, patched: a.patched_versions, url: a.url, where: [...new Set(hits.map((h) => h.chain))] });
    } else {
      ignoredDevOrNonServed++;
    }
  }

  const meta = (data.metadata && data.metadata.vulnerabilities) || {};
  console.log(`audit-gate · pnpm audit totals: ${JSON.stringify(meta)}`);
  console.log(`audit-gate · high/critical on a shipped/served surface: ${gated.length} · ignored (dev/build/non-served): ${ignoredDevOrNonServed}\n`);

  if (!gated.length) {
    console.log("✓ No high/critical advisory on a shipped or internet-facing surface. Gate passes.");
    process.exit(0);
  }

  gated.sort((x, y) => (x.sev === "critical" ? -1 : 1) - (y.sev === "critical" ? -1 : 1));
  console.log("✗ Gated findings (shipped/served surface, high/critical):\n");
  for (const g of gated) {
    console.log(`  [${g.sev.toUpperCase()}] ${g.mod} — ${g.title}`);
    console.log(`     fixed in: ${g.patched || "no published fix"}`);
    console.log(`     via: ${g.where.join("  |  ")}`);
    if (g.url) console.log(`     ${g.url}`);
    console.log("");
  }
  console.log(`Gate FAILED: ${gated.length} finding(s) on a shipped/served surface. Update the dep, or (if a false positive) tune scripts/audit-gate.mjs.`);
  process.exit(1);
}

main();
