/**
 * Launch the PACKAGED application and prove it actually shows its renderer.
 *
 * ⛔ WHY THIS IS NOT A PLAYWRIGHT SPEC. `afterPack.cjs` flips
 * `EnableNodeCliInspectArguments` off on every packaged binary, so `--inspect` is ignored
 * and no debugger can ever attach — deliberately, and correctly. Playwright's
 * `_electron.launch` needs exactly that, and on the Windows preflight of 13/09/2026 it sat
 * there for its full 180 s while the app ran perfectly well beside it. The fuse is not
 * the problem; assuming a debugger was.
 *
 * So: spawn it like any other process and read its stdout. The app prints
 * `[window] renderer loaded` once the renderer has finished loading (`src/main/window.ts`),
 * which is the one fact worth checking — "the process is still alive" is not an answer,
 * since the empty-window bug of 13/09 kept it alive indefinitely.
 *
 * What it catches that a build cannot: the packaged tree is a different tree — the asar,
 * what `asarUnpack` pulls back out of it, extraResources/extraFiles, the native modules
 * electron-builder FLATTENS, the C++ runtime DLLs beside the exe. Both Windows failures
 * this project has paid for lived there and were invisible in `out/`.
 *
 *   pnpm exec tsx scripts/smoke-packaged.ts <exe> [args…]
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FATAL_MAIN } from "./fatalMainStderr";

const MARKER = "[window] renderer loaded";
const TIMEOUT_MS = Number(process.env.SMOKE_PACKAGED_TIMEOUT_MS ?? 120_000);

const [exe, ...extraArgs] = process.argv.slice(2);
if (!exe) {
  console.error("usage: tsx scripts/smoke-packaged.ts <path to the packaged executable> [args…]");
  process.exit(2);
}
if (!existsSync(exe)) {
  console.error(`✗ no executable at ${exe}`);
  process.exit(1);
}

// A fresh profile: an installed app must start from nothing, which is the state of the
// machine that has just run the installer.
const profile = mkdtempSync(join(tmpdir(), "openmasq-smoke-"));
const child = spawn(exe, extraArgs, {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    OPENMASQ_USER_DATA_DIR: profile,
    OPENMASQ_DISABLE_DB: "1",
    OPENMASQ_E2E: "1",
  },
});

const stderrLines: string[] = [];
let done = false;

function finish(code: number, why: string): void {
  if (done) return;
  done = true;
  clearTimeout(timer);
  // SYNCHRONOUSLY, and before anything touches the profile: Windows leaves the
  // renderer/GPU/utility children behind when only the parent is signalled, and those
  // children keep the profile's files open.
  try {
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    /* already gone */
  }

  // The VERDICT first. Cleanup must never be able to change it — the Windows preflight
  // of 13/09/2026 reported failure on a run where the app had loaded its renderer
  // perfectly, because removing the profile threw EPERM a few ms after the kill.
  if (code === 0) {
    console.log(`✓ ${why}`);
  } else {
    console.error(`\n✗ ${why}`);
    console.error(
      `\n  main stderr (${stderrLines.length} line(s)):\n` +
        (stderrLines.map((l) => `    · ${l}`).join("\n") || "    (none)"),
    );
  }

  // Best effort, and genuinely optional: a leftover temp folder on a CI runner costs
  // nothing, while a throw here costs the whole answer.
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (e) {
    console.warn(`  (the temporary profile could not be removed: ${(e as Error).message})`);
  }
  process.exit(code);
}

child.stdout.on("data", (b: Buffer) => {
  const text = b.toString();
  process.stdout.write(text);
  if (text.includes(MARKER)) finish(0, `the packaged app loaded its renderer — ${exe}`);
});

child.stderr.on("data", (b: Buffer) => {
  const text = b.toString();
  process.stderr.write(text);
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    stderrLines.push(line);
    if (FATAL_MAIN.some((re) => re.test(line))) finish(1, `fatal line on main stderr: ${line}`);
  }
});

child.on("error", (e) => finish(1, `could not launch ${exe}: ${e.message}`));
child.on("exit", (code, signal) =>
  finish(1, `the packaged app exited before showing its renderer (code ${code}, signal ${signal})`),
);

const timer = setTimeout(
  () => finish(1, `no "${MARKER}" within ${TIMEOUT_MS} ms — the renderer never loaded`),
  TIMEOUT_MS,
);
