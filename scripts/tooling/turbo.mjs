#!/usr/bin/env node
// Runs turbo with a cache placed OUTSIDE the tree, so a re-clone starts warm. Turbo's cache
// keys hash CONTENT, never the absolute path, so one directory serves every checkout.
// `turbo.json` cannot carry this setting (it refuses an absolute `cacheDir`), hence the
// wrapper: one home for the default, inherited by pnpm, CI and every new checkout. A
// `TURBO_CACHE_DIR` already present in the environment wins. The directory is never purged
// (turbo has no GC); emptying it is risk-free.
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
