import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep, dirname, basename } from "node:path";

/**
 * The ONE security gate of the in-process filesystem tool: resolve a model-supplied
 * path to a real absolute path and prove it stays inside a user-GRANTED root and
 * outside any DENIED subtree. Every fs operation must route a path through here first.
 *
 * Symlink-safe (the classic filesystem-server foot-gun): it resolves the REAL path
 * (following symlinks) and checks the RESOLVED path — so a symlink sitting inside a
 * grant but pointing OUT of it is rejected, not followed. For a path that doesn't
 * exist yet (write/create/move-dest) it resolves the nearest EXISTING ancestor and
 * checks that, then re-appends only the trailing not-yet-existing segments (which are
 * validated to contain no `..`), so a symlinked parent can't be used to escape either.
 *
 * `roots`/`deny` are resolved to their real paths ONCE by {@link makeGrant} so a
 * granted root that is itself a symlink is compared by its real target.
 */
export interface Grant {
  /** Resolve + authorize a path; throws if it escapes the grant or hits a deny path. */
  resolve(target: string): string;
  /** The granted roots (real paths), for `list_allowed_directories`. */
  readonly roots: readonly string[];
}

/** Real path of an existing path, or null if it doesn't exist / can't be resolved. */
function realOrNull(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/** Real path of the nearest EXISTING ancestor of `p`, plus the trailing segments that
 *  don't exist yet. Walks up until an existing dir is found (or gives up at the root). */
function realExistingPrefix(p: string): { base: string; rest: string[] } | null {
  const rest: string[] = [];
  let cur = p;
  // Bounded walk (a path can't have more components than its length).
  for (let i = 0; i < 4096; i++) {
    const real = realOrNull(cur);
    if (real) return { base: real, rest: rest.reverse() };
    const parent = dirname(cur);
    if (parent === cur) return null; // reached the filesystem root, nothing existed
    rest.push(basename(cur));
    cur = parent;
  }
  return null;
}

/** True when `child` is `root` or strictly beneath it (path-segment aware, not a raw
 *  string prefix — so `/a/bc` is NOT considered under `/a/b`). */
function isWithin(root: string, child: string): boolean {
  return child === root || child.startsWith(root + sep);
}

export function makeGrant(rawRoots: string[], rawDeny: string[] = []): Grant {
  // Resolve each root to its REAL path once; drop any that don't resolve (a granted dir
  // that doesn't exist is meaningless).
  const roots = [...new Set(rawRoots.map(realOrNull).filter((r): r is string => !!r))];
  // Deny paths must NOT be existence-filtered: a secret file (e.g. keys.enc) that isn't
  // on disk YET must still be denied so it's protected the moment it's created. Prefer the
  // real path when it exists (symlink-safe), else keep the lexically-resolved absolute path.
  const deny = [...new Set(rawDeny.map((d) => realOrNull(d) ?? resolve(d)))];
  if (roots.length === 0) throw new Error("filesystem: no valid granted directory");

  const authorize = (target: string): string => {
    if (typeof target !== "string" || !target) throw new Error("chemin invalide");
    // Reject NUL and require an absolute path (the tool never resolves relative to cwd).
    if (target.includes("\0")) throw new Error("chemin invalide");
    if (!isAbsolute(target)) throw new Error(`chemin non absolu refusé : ${target}`);

    const existing = realOrNull(target);
    let real: string;
    if (existing) {
      real = existing;
    } else {
      // Not-yet-existing target (write/create/move-dest): anchor on the real nearest
      // existing ancestor, then re-append the trailing segments — but NONE of them may
      // be `.`/`..`/empty/contain a separator (which would let a crafted name climb out
      // of the resolved prefix). basename() already strips separators; guard the rest.
      const prefix = realExistingPrefix(target);
      if (!prefix) throw new Error(`chemin introuvable : ${target}`);
      for (const seg of prefix.rest) {
        if (seg === "" || seg === "." || seg === ".." || seg.includes(sep)) {
          throw new Error(`chemin refusé : ${target}`);
        }
      }
      real = prefix.rest.length ? resolve(prefix.base, ...prefix.rest) : prefix.base;
    }

    // Must sit under a granted root AND not under any denied subtree.
    if (!roots.some((r) => isWithin(r, real))) {
      // ⚠️ The refusal NAMES the roots and says what to do. The model cannot copy an
      // authorized path: tool results come back to it redacted segment by
      // segment, so it CLIMBS toward an ancestor it knows it can write (`~/Desktop`, then `~`)
      // — out of scope, refused, three times, and the loop gives up announcing « no
      // results » on folders that are full (measured 15/08). Discloses NOTHING new:
      // `list_allowed_directories` already returns these same roots to the same model. Same
      // remedy as the refusal for a guessed domain, which steers toward a search.
      throw new Error(
        `accès refusé (hors des dossiers autorisés) : ${target}. ` +
          `Dossiers autorisés : ${roots.join(", ")}. ` +
          `N'invente pas de chemin : omets « path » pour chercher dans TOUS les dossiers autorisés.`,
      );
    }
    if (deny.some((d) => isWithin(d, real))) {
      throw new Error(`accès refusé (chemin protégé) : ${target}`);
    }
    return real;
  };

  return { resolve: authorize, roots };
}
