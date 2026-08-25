/**
 * Installing the pinned WHEELS into a runtime baked for a machine we are NOT — and
 * proving, afterwards, that the bytes belong to that machine.
 *
 * Split out of `bake-python-runtime.ts` (which orchestrates download → extract → install →
 * prune → manifest) so the cross-compilation concern reads on its own; the bake script
 * stays a recipe.
 */
import { spawnSync } from "node:child_process";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { WHEELS } from "../src/main/python/wheels";
import { PY } from "../src/main/python/runtimeSpec";
import { binaryArchs, runsOn, type BinArch } from "../src/main/python/binaryArch";

/**
 * Wheel platform tags to resolve for, per FOREIGN target.
 *
 * A native bake runs the target's own interpreter, which knows its own tags. A cross bake
 * can't, so pip is handed the list — and it matches these EXACTLY (no "this macOS or
 * newer" inference), which is why several deployment targets are enumerated: a wheel is
 * tagged with whatever macOS its author built against. `--only-binary=:all:` means a tag
 * we failed to list is a LOUD failure ("no matching distribution"), never a source build
 * that would quietly produce host-arch objects. universal2 sits last: it satisfies both
 * arches, so it is a legitimate fallback — just a heavier one than a thin wheel.
 */
const CROSS_TAGS: Record<string, string[]> = {
  "darwin-x64": [
    "macosx_10_9_x86_64", "macosx_10_12_x86_64", "macosx_10_13_x86_64", "macosx_10_14_x86_64",
    "macosx_10_15_x86_64", "macosx_11_0_x86_64", "macosx_12_0_x86_64", "macosx_13_0_x86_64",
    "macosx_14_0_x86_64", "macosx_10_9_universal2", "macosx_11_0_universal2",
  ],
  "darwin-arm64": [
    "macosx_11_0_arm64", "macosx_12_0_arm64", "macosx_13_0_arm64", "macosx_14_0_arm64",
    "macosx_10_9_universal2", "macosx_11_0_universal2",
  ],
  "win32-x64": ["win_amd64"],
};

/** Run a child to completion, inheriting stdio; throw on non-zero. */
function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} → exit ${r.status}`);
}

/**
 * Install the pinned wheels into `sitePkgs`.
 *
 * NATIVE (`interpreter` given): run the target's own python, as it always did.
 *
 * CROSS: the target interpreter cannot be executed here — an x86_64 python on an Apple
 * Silicon runner needs Rosetta (not guaranteed on a CI image), a win32 python doesn't run
 * on macOS at all. So the HOST's pip resolves FOR the target: `--python-version` + `--abi`
 * + `--platform` + `--target` is pip's documented cross-install, and with
 * `--only-binary=:all:` nothing is ever compiled here, so no host-arch object can slip in.
 * What pip matched is a filename TAG, though — hence {@link assertArch} right after.
 */
export function installWheels(sitePkgs: string, target: string, interpreter: string | null): void {
  if (interpreter) {
    run(interpreter, ["-m", "pip", "install", "--no-input", "--only-binary=:all:", ...WHEELS]);
    return;
  }
  const tags = CROSS_TAGS[target];
  if (!tags) throw new Error(`no cross-install tags for ${target}`);
  const [major, minor] = PY.split(".");
  run("python3", [
    "-m", "pip", "install", "--no-input", "--only-binary=:all:",
    "--python-version", `${major}.${minor}`,
    "--implementation", "cp",
    "--abi", `cp${major}${minor}`,
    ...tags.flatMap((t) => ["--platform", t]),
    "--target", sitePkgs,
    ...WHEELS,
  ]);
}

/**
 * Refuse a tree whose native modules are for another CPU. Returns how many were read.
 *
 * The cross path resolves wheels by NAME; this reads the Mach-O/PE headers of what
 * actually landed. Without it the failure surfaces only on a user's machine — after the
 * build passed, after signing and notarisation — at the first `import numpy`. A universal2
 * module carries both slices and is accepted; anything unparseable is skipped (see
 * `runsOn`), so this gate says "wrong", never "unfamiliar".
 */
export async function assertArch(sitePkgs: string, want: BinArch, isWin: boolean): Promise<number> {
  const ext = isWin ? ".pyd" : ".so";
  const bad: string[] = [];
  let checked = 0;

  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!e.name.endsWith(ext)) continue;
      checked++;
      // The header lives in the first bytes — no need to read a 40 MB .so whole.
      const fh = await open(abs, "r");
      try {
        const { buffer } = await fh.read(Buffer.alloc(4096), 0, 4096, 0);
        // Name the arch we DID find: "is arm64" turns a failure into a diagnosis (a stale
        // tree, a tag list that matched the wrong wheel), where "is wrong" starts a hunt.
        if (!runsOn(buffer, want)) {
          bad.push(`${abs.slice(sitePkgs.length + 1)} (${binaryArchs(buffer).join("+") || "?"})`);
        }
      } finally {
        await fh.close();
      }
    }
  }

  await walk(sitePkgs);
  if (bad.length > 0) {
    throw new Error(
      `${bad.length}/${checked} native modules are NOT ${want} — e.g. ${bad.slice(0, 3).join(", ")}`,
    );
  }
  return checked;
}
