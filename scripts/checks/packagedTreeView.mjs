// The RUNTIME view of the packaged tree: `app.asar` ∪ `app.asar.unpacked`, materialised
// as one real directory so plain `require.resolve` walks it the way ELECTRON would.
//
// Why this exists: `asarUnpack` (apps/desktop/electron-builder.cjs) deliberately ships
// only natives and path-loaded trees OUTSIDE the asar — "all the rest of the JS stays
// under the seal". At runtime that seal is invisible to resolution: Electron keeps an
// unpacked file's `__filename` at its `app.asar/...` path, so its `require("js-base64")`
// walks back INTO the asar and loads. A checker that resolves only inside
// `app.asar.unpacked/node_modules` therefore reports UNRESOLVED for every sealed
// dependency of an unpacked package — findings that cannot crash the app. That is not
// hypothetical: it held as long as the workspace's old server apps forced version
// conflicts that NESTED those deps under their unpacked consumers; the 2026-08 server
// split unified the versions, the collector hoisted the deps flat into the sealed asar,
// and 21 phantom "dead on launch" findings blocked the first release build.
//
// What it does NOT model — kept strict on purpose, in the caller: a `worker_threads`
// Worker started on a REAL unpacked path resolves from real directories only (no asar
// fall-through), so the trees that run that way must stay self-sufficient in
// `app.asar.unpacked` (the caller's REAL_PATH_WORKER_PKGS).
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
  // `realpathSync`, or nothing matches: macOS's tmpdir is `/var/...`, a symlink to
  // `/private/var/...` — and `require.resolve` returns canonical paths, so every
  // reachability test of the form `startsWith(view)` would silently fail against the
  // un-canonicalised spelling (observed: "0 files on the load path", all findings dormant).
  const view = join(realpathSync(tmpdir()), "pkgtree-runtime-view");
  rmSync(view, { recursive: true, force: true });
  mkdirSync(view, { recursive: true });
  // `extractAll` reads unpacked entries from the sibling dir, extracts everything it can,
  // and throws ONE error at the end listing the files it could not. On a single-arch
  // build that list is exactly the OTHER arch's native stubs: the asar index declares
  // them unpacked, electron-builder never wrote them. Those are tolerated — a missing
  // `app.asar.unpacked` SOURCE is by definition not sealed content, and the overlay below
  // re-copies every unpacked file that does exist. Anything else (a sealed byte that
  // fails to extract is archive corruption) still throws.
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
