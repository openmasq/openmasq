/**
 * PURE build-descriptor for the sandboxed Python runtime — no Electron/Node-runtime
 * imports beyond `node:crypto`, so it is importable BOTH by the main bundle
 * (`runtime.ts`) AND by the build-time bake script (`scripts/bake-python-runtime.ts`,
 * run via tsx). Single source of truth for: which CPython to fetch, its verified
 * digests, the wheel set signature, the pruning globs, and the bundled font.
 *
 * The runtime is now BUNDLED into the app (see `runtime.ts` + `electron-builder.cjs`
 * `extraResources`), baked by `scripts/bake-python-runtime.ts`. A packaged build never
 * downloads; only `pnpm dev` (no bundle present) falls back to the download path — and
 * even then the tarball is sha256-verified against {@link TARBALL_SHA256}.
 */
import { createHash } from "node:crypto";
import { WHEELS } from "./wheels";

const PBS_TAG = "20250612";
/** Exported because the CROSS bake has to tell pip which interpreter it is resolving
 *  wheels FOR (`--python-version` / `--abi cp312`), and that must be this same version
 *  or the tags silently stop matching. One source, both readers. */
export const PY = "3.12.11";

/** Per-platform `install_only` tarball name (python-build-standalone triples). */
export const TARBALL: Partial<Record<string, string>> = {
  "darwin-arm64": `cpython-${PY}+${PBS_TAG}-aarch64-apple-darwin-install_only.tar.gz`,
  "darwin-x64": `cpython-${PY}+${PBS_TAG}-x86_64-apple-darwin-install_only.tar.gz`,
  "linux-x64": `cpython-${PY}+${PBS_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
  "win32-x64": `cpython-${PY}+${PBS_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz`,
};

/** Pinned sha256 of each tarball (from the release SHA256SUMS). The download is now
 *  VERIFIED — a mismatch aborts, closing the "unverified beyond TLS" hole. */
export const TARBALL_SHA256: Partial<Record<string, string>> = {
  "darwin-arm64": "c6d4843e8af496f034176908ae3384556680284653a4bff45eff07e43fe4ae34",
  "darwin-x64": "7e3468bde68650fb8f63b663a24c56d0bb3353abd16158939b1de0ad60dab195",
  "linux-x64": "8e8bb0dbc815fb0b3912e0d8fc0a4f4aaac002bfc1f6cb0fcd278f2888f11bcf",
  "win32-x64": "7b93afa91931dbc37b307a81b8680b30193736b5ef29a44ef6452f702c306e7a",
};

/** Base URL of a PBS release asset (append a TARBALL name). */
export const pbsUrl = (name: string): string =>
  `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${name}`;

/** The brand font (Space Grotesk, OFL) for matplotlib. `@fontsource` ships only woff2
 *  (matplotlib needs TTF/OTF), so we pull the OFL TTF from Google Fonts at BAKE time and
 *  bundle it — no runtime fetch. */
// Pinned to a COMMIT (not the mutable `main`) + a sha256 the bake verifies, so a repointed
// google/fonts ref can't slip a different asset into the bundle (audit: pin remote assets).
export const SPACE_GROTESK_URL =
  "https://raw.githubusercontent.com/google/fonts/ec0464b978de222073645d6d3366f3fdf03376d8/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf";
export const SPACE_GROTESK_SHA256 =
  "acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72";

/**
 * Glob-ish suffixes pruned from the baked site-packages to slim the bundle WITHOUT
 * hurting behaviour or import speed (see the plan's size analysis):
 *   - `tests/` dirs (~83 MB) — never imported at runtime.
 *   - `pip`/`setuptools`/`_distutils_hack`/`pkg_resources` (~12 MB) — the runtime is
 *     frozen + read-only, so no in-app install is ever possible.
 * KEPT on purpose: `__pycache__` (fast imports under a read-only runtime) and every
 * `*.dist-info` (some packages read their version via `importlib.metadata`).
 * Matched by {@link isPruned} against a path RELATIVE to site-packages, POSIX-separated.
 */
const PRUNE_DIRS = new Set([
  "pip",
  "setuptools",
  "_distutils_hack",
  "pkg_resources",
]);

/** True if a site-packages-relative path (POSIX `/`) should be pruned from the bundle. */
export function isPruned(rel: string): boolean {
  const parts = rel.split("/");
  if (parts.some((p) => p === "tests")) return true; // any tests/ dir at any depth
  if (PRUNE_DIRS.has(parts[0])) return true; // top-level tool packages
  return false;
}

/**
 * Whole directories removed wholesale from the baked runtime, keyed on a path RELATIVE
 * to the PYTHON ROOT (`<out>/python`, POSIX `/`). These live OUTSIDE site-packages, so
 * {@link isPruned} (which only walks site-packages) can never reach them. Currently none.
 */
export const PRUNE_ROOT_DIRS: string[] = [];

/** Bumped when the on-disk LAYOUT changes (not the contents) so an old cache is rebuilt.
 *  `2` = no-venv: wheels install straight into the base CPython's site-packages, so the
 *  runtime is relocatable + bundle-able (a venv bakes absolute paths → not relocatable). */
export const LAYOUT = "2";

/** Runtime cache/identity signature = layout + CPython build + the exact pinned wheel set.
 *  Changing the layout, WHEELS (adding a package, bumping a pin) or the CPython flips it, so
 *  a stale cached/baked runtime is detected. Shared by the bake manifest + the dev path. */
export const runtimeSignature = (): string =>
  `l${LAYOUT}|${PY}+${PBS_TAG}|${createHash("sha256").update([...WHEELS].sort().join(",")).digest("hex").slice(0, 16)}`;

/** Filename-safe, CONTENT-ADDRESSED name of the pre-baked runtime archive for a
 *  platform/arch, derived from {@link runtimeSignature} — so it is immutable
 *  (cache-forever), coexists with other bumps in R2 + userData, and lets the app ask
 *  for EXACTLY the runtime its own code was built against. CI bakes → tars → uploads it
 *  under `runtime/<name>` in the updates R2; the packaged app downloads + verifies it
 *  (decoupled from the app update payload — see `runtime.ts`). */
export function runtimeArchiveName(platform: string, arch: string): string {
  const sig = runtimeSignature().replace(/[^a-z0-9]+/gi, "-");
  return `python-runtime-${platform}-${arch}-${sig}.tar.gz`;
}
