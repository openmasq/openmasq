// The RUNTIME view of the packaged tree: `app.asar` ∪ `app.asar.unpacked`, materialised as
// one real directory so plain `require.resolve` walks it the way ELECTRON would. `asarUnpack`
// ships only natives and path-loaded trees outside the asar, and Electron keeps an unpacked
// file's `__filename` at its `app.asar/...` path, so its requires walk back INTO the asar.
// Resolving inside `app.asar.unpacked` alone would report UNRESOLVED for every sealed
// dependency of an unpacked package — findings that cannot crash the app.
//
// NOT modelled, on purpose (kept strict in the caller): a `worker_threads` Worker started on
// a REAL unpacked path has no asar fall-through (REAL_PATH_WORKER_PKGS).
import { existsSync, rmSync, cpSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

/**
 * @param unpackedNodeModules `<...>/Resources/app.asar.unpacked/node_modules`
 * @returns `{ appRoot, tree }` of the merged view — or of the unpacked dir alone when no
 *          `app.asar` sits beside it (an unpacked-only layout: nothing is sealed).
 */
export function runtimeView(unpackedNodeModules) {
  const unpackedRoot = dirname(unpackedNodeModules);
  const asar = join(dirname(unpackedRoot), "app.asar");
  if (!existsSync(asar)) return { appRoot: unpackedRoot, tree: unpackedNodeModules };
  // `realpathSync`, or nothing matches: macOS's tmpdir is a symlink and `require.resolve`
  // returns canonical paths, so every `startsWith(view)` test would fail silently.
  const view = join(realpathSync(tmpdir()), "pkgtree-runtime-view");
  rmSync(view, { recursive: true, force: true });
  mkdirSync(view, { recursive: true });
  // `extractAll` throws ONE error listing the unpacked entries it could not extract. On a
  // single-arch build those are the OTHER arch's native stubs (declared unpacked, never
  // written) and are tolerated — the overlay below re-copies every unpacked file that exists.
  // Anything else is archive corruption and still throws.
  try {
    req("@electron/asar").extractAll(asar, view);
  } catch (e) {
    const lines = String(e?.message ?? e).split("\n").filter((l) => l.includes("ENOENT"));
    const phantom = lines.length > 0 && lines.every((l) => l.includes("app.asar.unpacked"));
    if (!phantom) throw e;
  }
  cpSync(unpackedRoot, view, { recursive: true, force: true });
  return { appRoot: view, tree: join(view, "node_modules") };
}
