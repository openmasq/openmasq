import { resolve, sep, extname } from "node:path";

// ── file-store path safety (audit: renderer-controlled id → path traversal) ──────
// The renderer supplies the file `id` (and display `name`) that main splices into an
// on-disk blob path (`${id}-original${ext}` under userData/files) and into the temp
// file it hands `shell.openPath`. An unvalidated `id` of `../../…` escapes the files
// dir → arbitrary write / read / delete + auto-open (a renderer XSS's exact goal, the
// same threat the read-gate defends). Every splice of an untrusted id/name into a path
// goes through here first, fail-closed: an id is ALLOW-listed, a name is fully
// sanitised, and the resulting path is confined to its intended dir.

/** Chars permitted in a stored-file id that becomes part of an on-disk filename:
 *  the base36 `uid()` we mint + uuid()-style hyphens, never a separator or `..`. */
const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

/** Throw unless `id` is a safe token to splice into a path. Fail-closed: reject a
 *  non-string, anything with a `..` sequence, or any char outside the allow-list. */
export function assertSafeFileId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.includes("..") || !SAFE_ID_RE.test(id)) {
    throw new Error("Identifiant de fichier invalide.");
  }
}

/** A safe file EXTENSION (leading dot kept, lower-cased) derived from an untrusted
 *  name — allow-list `[A-Za-z0-9]`, single-part, capped. Anything else → no ext. */
export function safeExt(name: unknown): string {
  const ext = extname(typeof name === "string" ? name : "");
  return /^\.[A-Za-z0-9]{1,16}$/.test(ext) ? ext.toLowerCase() : "";
}

// Filename sanitisation rules, cross-OS (the well-known `sanitize-filename` set):
//   illegal on various OSes:  / ? < > \ : * | "      (kb.acronis.com/content/39790)
//   C0 (0x00-0x1f) + C1 (0x80-0x9f) control codes     (en.wikipedia.org/wiki/C0_and_C1_control_codes)
//   reserved unix names:      "."  ".."  (any run of pure dots)
//   reserved Windows devices: CON PRN AUX NUL COM0-9 LPT0-9, with/without an extension
const ILLEGAL_RE = /[/?<>\\:*|"]/g;
// eslint-disable-next-line no-control-regex -- deliberately stripping control codes
const CONTROL_RE = /[\x00-\x1f\x80-\x9f]/g;
const PURE_DOTS_RE = /^\.+$/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const REPLACEMENT = "_";

/** Strip trailing dots/spaces (illegal on some Windows file systems). A char loop,
 *  NOT a regex, to avoid a quadratic ReDoS on a crafted name (CWE-1333). */
function stripTrailingDotsAndSpaces(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === "." || s[end - 1] === " ")) end--;
  return s.slice(0, end);
}

/** Truncate to `maxBytes` UTF-8 bytes without splitting a multi-byte char — the
 *  per-component filesystem cap is 255 bytes, not 255 chars. */
function truncateUtf8(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--; // back off a continuation byte
  return buf.subarray(0, end).toString("utf8");
}

/** Fully sanitise an untrusted name into a safe BASENAME for a GENERATED file we keep
 *  for the OS "open" handler. Drops any directory part (the traversal vector), then
 *  applies the cross-OS filename rules above; the real extension survives so the
 *  default app still opens it, and it never returns an empty / all-`_` name. */
export function safeFileName(name: unknown, fallback = "fichier"): string {
  const raw = typeof name === "string" ? name : "";
  const base = raw.split(/[\\/]/).pop() ?? ""; // last path segment, either separator
  let out = base
    .replace(ILLEGAL_RE, REPLACEMENT)
    .replace(CONTROL_RE, REPLACEMENT)
    .replace(PURE_DOTS_RE, REPLACEMENT)
    .replace(WINDOWS_RESERVED_RE, REPLACEMENT);
  out = stripTrailingDotsAndSpaces(out);
  out = truncateUtf8(out, 200).trim(); // 200 leaves room for our `<slug>-<uuid>-` prefix
  return out && !/^_+$/.test(out) ? out : fallback;
}

/** True when `p` resolves to a location INSIDE `dir` (or is `dir` itself). Used to
 *  confine both a freshly-built blob path AND a path read BACK from the DB — a row
 *  written by an older, pre-validation build could still hold a traversed path. */
export function isUnderDir(p: string, dir: string): boolean {
  const root = resolve(dir);
  const full = resolve(p);
  return full === root || full.startsWith(root + sep);
}

/** Fail-closed {@link isUnderDir}: throw when `p` escapes `dir`. */
export function assertUnderDir(p: string, dir: string): void {
  if (!isUnderDir(p, dir)) {
    throw new Error("Chemin de fichier hors du dossier autorisé.");
  }
}
