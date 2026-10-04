#!/usr/bin/env node
// `@openmasq/redact` is the ONE workspace package published to npm. Inside the monorepo every
// consumer links it through `workspace:*`, so nothing here ever installs it the way a stranger
// does — a dependency only the monorepo can resolve breaks ONLY for them, after the publish.
// This guard installs the packed tarball into an EMPTY project and runs the core round-trip.
//
//   node scripts/checks/check-redact-pack.mjs              packs packages/redact (needs its dist/)
//   node scripts/checks/check-redact-pack.mjs <file.tgz>   checks that exact tarball (the release)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const work = mkdtempSync(join(tmpdir(), "redact-pack-"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const fail = (msg) => {
  console.error(`✗ check:redact-pack — ${msg}`);
  process.exit(1);
};

try {
  let tarball = process.argv[2] && resolve(process.argv[2]);
  if (!tarball) {
    run("pnpm", ["pack", "--pack-destination", work], join(root, "packages/redact"));
    tarball = join(work, readdirSync(work).find((f) => f.endsWith(".tgz")));
  }

  // The manifest a stranger receives: no workspace protocol, no private workspace package.
  const manifest = JSON.parse(run("tar", ["-xzOf", tarball, "package/package.json"], work));
  if (manifest.private) fail("the packed manifest is private");
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (String(range).startsWith("workspace:")) fail(`${field}.${name} is still "${range}"`);
      if (name.startsWith("@openmasq/") || name === "tesseract2.js") fail(`${field}.${name} is unpublished`);
    }
  }
  const files = run("tar", ["-tzf", tarball], work);
  for (const f of ["package/LICENSE", "package/NOTICE", "package/README.md", "package/dist/index.js"]) {
    if (!files.split("\n").includes(f)) fail(`${f} is missing from the tarball`);
  }
  // No sourcemap ships, and no shipped file points at one (a dangling `sourceMappingURL` is a
  // warning in every consumer's bundler).
  const maps = files.split("\n").filter((f) => f.endsWith(".map"));
  if (maps.length) fail(`${maps.length} sourcemap(s) in the tarball, e.g. ${maps[0]}`);
  const code = files.split("\n").filter((f) => /\.(c|m)?js$/.test(f));
  for (const f of code) {
    if (run("tar", ["-xzOf", tarball, f], work).includes("sourceMappingURL=")) fail(`${f} references a sourcemap`);
  }

  // A clean install with NO optional peer, then the core API in both module systems.
  const app = join(work, "consumer");
  run("mkdir", ["-p", app]);
  writeFileSync(join(app, "package.json"), '{ "name": "consumer", "private": true }\n');
  run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", tarball], app);
  writeFileSync(
    join(app, "esm.mjs"),
    `import { redact, pseudonymize, unredact } from "@openmasq/redact";
const text = "Mail jean.dupont@example.org, IBAN FR76 3000 6000 0112 3456 7890 189";
if (!redact(text, { vault: {} }).text.includes("[REDACTED_EMAIL_1]")) throw new Error("redact");
const vault = {};
const out = await pseudonymize(text, { vault });
if (out.text.includes("jean.dupont@example.org")) throw new Error("pseudonymize leaked");
if (unredact(out.text, vault) !== text) throw new Error("round-trip");
`,
  );
  run("node", ["esm.mjs"], app);
  run("node", ["-e", 'const m = require("@openmasq/redact"); if (typeof m.pseudonymize !== "function") process.exit(1);'], app);

  console.log(`✓ ${manifest.name}@${manifest.version} installs alone and round-trips (ESM + CJS).`);
} catch (err) {
  fail(err.stderr?.toString() || err.message);
} finally {
  rmSync(work, { recursive: true, force: true });
}
