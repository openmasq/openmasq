#!/usr/bin/env node
// Runs turbo with a cache placed OUTSIDE the tree.
//
// By default turbo writes to `<repo>/.turbo/cache`, hence inside the tree: a re-clone (or,
// back when the worktree convention existed, every fresh tree) started from a cold cache
// and rebuilt the entire graph.
// Turbo's cache keys are a hash of the CONTENT (package + task + files + dependency
// hashes), never of the absolute path: an artefact produced in one worktree is therefore
// valid in every other, and two diverging branches naturally have different keys.
//
// `turbo.json` can NOT carry this setting — it refuses an absolute `cacheDir` and points
// explicitly at `--cache-dir` / `TURBO_CACHE_DIR`; a RELATIVE path would resolve elsewhere
// depending on where the worktree was created. Hence this wrapper: one single home for the
// default, inherited by pnpm, CI and every new checkout with no installation at all. A
// `TURBO_CACHE_DIR` already present in the environment wins.
//
// ⚠️ The directory is never purged automatically (turbo has no GC): it grows with the
// history of hashes. Emptying it is risk-free — at worst you rebuild.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const cacheDir =
  process.env.TURBO_CACHE_DIR || join(homedir(), ".cache", "turbo", "openmasq");

const child = spawn("turbo", process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, TURBO_CACHE_DIR: cacheDir },
  shell: process.platform === "win32",
});

// `pnpm dev` is a PERSISTENT task: without these two lines, Ctrl-C kills this wrapper
// before turbo has handed back control, leaving the dev servers orphaned. We relay the
// signal and only exit once the child is really gone.
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
