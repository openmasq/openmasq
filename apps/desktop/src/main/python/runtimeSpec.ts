/**
 * PURE build-descriptor for the sandboxed Python runtime, importable by the main bundle
 * AND the bake script: which CPython, its digests, the wheel signature, the pruning
 * globs, the bundled font. A packaged build never downloads; `pnpm dev` without a bundle
 * downloads sha256-verified against {@link TARBALL_SHA256}.
 */
import { createHash } from "node:crypto";
import { WHEELS } from "./wheels";

const PBS_TAG = "20250612";
/** The CROSS bake tells pip which interpreter it resolves wheels FOR: one source. */
export const PY = "3.12.11";

/** Per-platform `install_only` tarball name (python-build-standalone triples). */
export const TARBALL: Partial<Record<string, string>> = {
  "darwin-arm64": `cpython-${PY}+${PBS_TAG}-aarch64-apple-darwin-install_only.tar.gz`,
  "darwin-x64": `cpython-${PY}+${PBS_TAG}-x86_64-apple-darwin-install_only.tar.gz`,
  "linux-x64": `cpython-${PY}+${PBS_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
  "win32-x64": `cpython-${PY}+${PBS_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz`,
};

/** Pinned sha256 of each tarball (from the release SHA256SUMS); a mismatch aborts. */
export const TARBALL_SHA256: Partial<Record<string, string>> = {
  "darwin-arm64": "c6d4843e8af496f034176908ae3384556680284653a4bff45eff07e43fe4ae34",
  "darwin-x64": "7e3468bde68650fb8f63b663a24c56d0bb3353abd16158939b1de0ad60dab195",
  "linux-x64": "8e8bb0dbc815fb0b3912e0d8fc0a4f4aaac002bfc1f6cb0fcd278f2888f11bcf",
  "win32-x64": "7b93afa91931dbc37b307a81b8680b30193736b5ef29a44ef6452f702c306e7a",
};

/** Base URL of a PBS release asset (append a TARBALL name). */
export const pbsUrl = (name: string): string =>
  `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${name}`;

/** The brand font (OFL) for matplotlib, pulled at BAKE time from the official repo at a
 *  pinned COMMIT + a sha256 the bake verifies. No runtime fetch. */
export const SPACE_GROTESK_URL =
  "https://raw.githubusercontent.com/google/fonts/ec0464b978de222073645d6d3366f3fdf03376d8/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf";
export const SPACE_GROTESK_SHA256 =
  "acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72";

/**
 * Pruned from the baked site-packages: `tests/` dirs, and the installer tooling (the
 * runtime is frozen + read-only). KEPT on purpose: `__pycache__` (fast imports) and every
 * `*.dist-info` (`importlib.metadata`). Matched by {@link isPruned}, POSIX-relative.
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

/** Directories removed from the PYTHON ROOT (outside site-packages). Currently none. */
export const PRUNE_ROOT_DIRS: string[] = [];

/** Bumped when the on-disk LAYOUT changes. `2` = no venv (a venv bakes absolute paths). */
export const LAYOUT = "2";

/** layout + CPython build + the pinned wheel set: any change flips it. */
export const runtimeSignature = (): string =>
  `l${LAYOUT}|${PY}+${PBS_TAG}|${createHash("sha256").update([...WHEELS].sort().join(",")).digest("hex").slice(0, 16)}`;

/** CONTENT-ADDRESSED archive name, from {@link runtimeSignature}: immutable, so the app
 *  can ask for EXACTLY the runtime its code was built against. */
export function runtimeArchiveName(platform: string, arch: string): string {
  const sig = runtimeSignature().replace(/[^a-z0-9]+/gi, "-");
  return `python-runtime-${platform}-${arch}-${sig}.tar.gz`;
}
