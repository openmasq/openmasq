import { hashString, fakeToken } from "./primitives";
import { isStopword } from "../stopwords";
import { isCountry } from "../../engine/geo/countries";
import { isNotoriousEntity } from "../notorious";

/**
 * A fake filesystem path: keep the leading root verbatim (`/Users`, `~`, `C:\` —
 * the same on every machine, so not identifying) and scramble everything after it
 * (the username + folder names) with {@link fakeToken}, which preserves every
 * separator (`/ \ . - _` and spaces) and the exact length. The result still looks
 * like a plausible path to the model, but leaks neither the user nor the layout;
 * the real path is restored from the vault when the model calls a tool with it.
 *
 * **Segment-wise + deterministic.** Each `/`-separated segment is faked from ITS
 * OWN hash (not the whole path's), so the SAME real segment always yields the SAME
 * fake across every path — the machine layout / directory structure is preserved
 * (an agent can still tell two files share a folder, and navigate). `attempt`
 * perturbs every segment together, used only to dodge a rare collision.
 *
 * ⚠️ **A GENERIC segment is left VERBATIM, never faked** ({@link isDistinctivePathSegment}).
 * It is the same set the vault deliberately skips — a common folder word must not
 * forward-alias onto ordinary prose. Faking one we refuse to vault was the worst of
 * both: it cost the model every semantic cue a filesystem question runs on, AND it
 * was IRREVERSIBLE — a path the model recomposes rather than echoing verbatim came
 * back with that segment still scrambled (`/Users/julien/xMxQrqR`), i.e. a path that
 * does not exist. Pinned by `../../paths.test.ts`.
 */
export function fakePath(value: string, attempt = 0): string {
  const { head, ext, parts } = splitPath(value);
  // Nothing distinctive to hide (a path made only of common folder words) ⇒ fake
  // everything as before, so the candidate can never come out EQUAL to the real
  // value (which the allocator rejects, since a "fake" equal to the input is a leak).
  const keepGeneric = hasDistinctiveSegment(parts);
  let out = head;
  for (let i = 0; i < parts.length; i++) {
    // Even index = a segment; odd index = the separator run between segments.
    const isSeg = i % 2 === 0 && !!parts[i];
    if (!isSeg) out += parts[i];
    else if (keepGeneric && !isDistinctivePathSegment(parts[i])) out += parts[i];
    else out += fakePathSegment(parts[i], attempt);
  }
  return out + ext;
}

// Well-known, non-identifying path components — left verbatim, and never vaulted
// (so "Desktop"/"Documents" elsewhere in the conversation is left alone).
const GENERIC_PATH_SEGMENTS = new Set(
  [
    "users", "user", "home", "root", "desktop", "documents", "downloads",
    "library", "application support", "applications", "movies", "music",
    "pictures", "public", "shared", "sites", "var", "usr", "etc", "opt",
    "tmp", "temp", "bin", "lib", "sbin", "dev", "private", "system", "volumes",
    "program files", "program files (x86)", "programdata", "appdata", "roaming",
    "local", "localcache", "cache", "caches", "onedrive", "icloud",
    "google drive", "dropbox", "node_modules", "src", "dist", "build",
  ].map((s) => s.toLowerCase()),
);

/**
 * A segment worth faking AND vaulting: not a well-known folder, ≥3 chars, and not
 * made up entirely of stopwords / generic words (so a "de la" folder doesn't leak
 * its common words into a forward alias). ONE predicate for both decisions on
 * purpose — "hidden from the model" and "restorable from the vault" must name the
 * same set, or a segment ends up scrambled with no way back (root rule 9).
 */
export function isDistinctivePathSegment(seg: string): boolean {
  const s = seg.trim();
  if (s.length < 3) return false;
  if (GENERIC_PATH_SEGMENTS.has(s.toLowerCase())) return false;
  // A segment that is a COUNTRY or a notorious BRAND (« invoices/ovh ») stays VERBATIM,
  // like a generic segment: the vaulter mints a word-for-word alias that `applyVault`
  // then reapplies to PROSE (« ovh - 2 rue kellermann » → « Ezy - … », 02/08
  // log) — the very cascade generic segments avoid. Accepted residual: in
  // Strict the brand name stays readable in the FAKE path (the rest of the path
  // stays redacted); the alternative rewrote the brand throughout the whole text.
  if (isCountry(s) || isNotoriousEntity(s, "company", { commercial: true })) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => isStopword(w) || GENERIC_PATH_SEGMENTS.has(w.toLowerCase()))) {
    return false;
  }
  return true;
}

/** True when a `splitPath` parts array holds at least one distinctive segment. */
export function hasDistinctiveSegment(parts: string[]): boolean {
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i] && isDistinctivePathSegment(parts[i])) return true;
  }
  return false;
}

const PATH_HEAD_RE = /^(?:~|[A-Za-z]:[\\/]|\/[^/\\]*[\\/])/;
const PATH_EXT_RE = /\.[A-Za-z0-9]{1,8}$/;

/**
 * Split a path into its verbatim `head` (root, e.g. `/Users/`, `~`, `C:\`), a
 * trailing `ext` (`.py`), and the middle `parts` — a `.split(/([\\/]+)/)` array
 * where even indices are segments and odd indices are the separators between them.
 * Shared by {@link fakePath} and the vault-aware `buildFakePath`.
 */
export function splitPath(value: string): { head: string; ext: string; parts: string[] } {
  const ext = value.match(PATH_EXT_RE)?.[0] ?? "";
  const body = ext ? value.slice(0, -ext.length) : value;
  const head = body.match(PATH_HEAD_RE)?.[0] ?? "";
  return { head, ext, parts: body.slice(head.length).split(/([\\/]+)/) };
}

/** Deterministic same-shape fake of ONE path segment. Seeded by the LOWERCASED segment
 *  so the SAME segment in a different casing (`Julien` vs `julien` on a case-insensitive
 *  filesystem) yields the SAME fake — one identity, so an agent still sees two references
 *  as the same file/folder instead of two unrelated fake paths. */
export function fakePathSegment(seg: string, attempt = 0): string {
  return fakeToken(seg, (hashString(seg.toLowerCase()) + attempt * 7919) >>> 0);
}
