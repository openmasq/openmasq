import { app } from "electron";
import { dirname, join } from "node:path";
import { mplConfigDir } from "./runtime";
import { BRAND } from "@openmasq/branding";

/**
 * The WINDOWS jail — the third member of a family whose other two are OS-provided.
 * macOS has `sandbox-exec`, Linux has `bwrap`, Windows has nothing on the PATH: confining
 * a child there means acting on its TOKEN, and Node exposes no token API at any level. So
 * the launcher is OURS (`apps/desktop/native/win-jail/`, Rust), built by
 * `scripts/bake-win-jail.ts` and shipped via `win.extraResources`.
 *
 * This module is the TypeScript half — where the binary lives, and the argv that drives it.
 * It sits beside `sandbox.ts` rather than inside it because that file is already over the
 * LOC cap, and because a jail is easier to review as one piece (rule 10).
 */

/** Path of the bundled launcher. Packaged: `${resourcesPath}/win-jail`. Dev: the same bake
 *  output under `build/`, so `pnpm dev` is jailed too once `pnpm bake:jail` has run.
 *  Absent ⇒ `jailAvailability()` is "none" ⇒ `runPython` refuses. Deliberate: a missing
 *  launcher must never degrade into running de-redacted code unconfined. */
export function winJailExe(): string {
  const dir = app.isPackaged
    ? join(process.resourcesPath, "win-jail")
    : join(__dirname, "..", "..", "build", "win-jail");
  return join(dir, `${BRAND.slug}-jail.exe`);
}

/**
 * The argv running `pythonBin mainPy` inside an AppContainer.
 *
 * It reads SHORT, and that is the point. `seatbeltProfile` and the `bwrap` argv both start
 * from "everything is readable" and subtract the secrets we thought to name, so they carry
 * the whole deny-list — and forgetting one entry is a silent leak. An AppContainer starts
 * from NOTHING: only what is granted here exists for the child, so the failure mode of an
 * omission is a broken run, not an exfiltration. `secretPaths()` is deliberately NOT passed;
 * it would be a no-op, and writing it would suggest this jail depends on that list.
 *
 * No proxy port either: an AppContainer with an empty capability set has no socket at all,
 * loopback included (see `noNetwork()` in `sandbox.ts`).
 */
export function winJailCmd(
  pythonBin: string,
  mainPy: string,
  scratch: string,
  memoryMb: number,
): { cmd: string; args: string[] } {
  return {
    cmd: winJailExe(),
    args: [
      // The runtime ROOT: `<root>/python/python.exe` is the interpreter, so two dirnames up
      // is the root — and the stdlib, the wheels and the brand fonts (`<root>/fonts`) all
      // sit under it. One grant, not four.
      "--allow-read", dirname(dirname(pythonBin)),
      // The per-run scratch (main.py, figures/, out/, tmp/) and the PERSISTENT matplotlib
      // cache, which a run may legitimately refresh.
      "--allow-write", scratch,
      "--allow-write", mplConfigDir(),
      "--memory-mb", String(memoryMb),
      "--active-processes", "64",
      "--", pythonBin, mainPy,
    ],
  };
}
