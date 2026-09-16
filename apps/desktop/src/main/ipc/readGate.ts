import { app } from "electron";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "path";
import { BRAND } from "@openmasq/branding";

// ── files:read confinement ───────────────────────────────────────────────────
// The renderer may only read a path the USER granted this session, or one inside our own
// userData / temp dir, never an arbitrary path (an XSS would exfiltrate the keys, the vault,
// ~/.ssh). Module-level state so the grant and the later check share the SAME Set.
const readGrants = new Set<string>();
const normPath = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

/** Grant reading a path this session — the user just picked it via the native dialog
 *  (or an E2E fixture env). A later {@link assertReadAllowed} for it then passes. */
export function grantRead(p: string): void {
  readGrants.add(normPath(p));
}

let userDataRoot: string | null = null;
let tmpRoot: string | null = null;
let secretRead: { files: Set<string>; dirs: string[] } | null = null;
// The at-rest SECRETS inside userData are denied unconditionally, even though userData is a
// read root (dev-plaintext keys, the DB key, the session, the vault DBs).
function secretReadPaths(): { files: Set<string>; dirs: string[] } {
  if (secretRead) return secretRead;
  const ud = app.getPath("userData");
  secretRead = {
    files: new Set(
      ["keys.enc", "db-key.enc", "auth.enc", "sync-pass.enc", "mcp.json"].map((f) => normPath(resolve(ud, f))),
    ),
    dirs: [
      normPath(resolve(ud, "accounts")), // vault DBs (openmasq-<uid>.db) + mcp-<uid>.json
      normPath(resolve(ud, "broker")), // CDP pipe→ws broker secret
      normPath(resolve(ud, "agent-browser")), // isolated browser profile: cookies of the authenticated SaaS
      normPath(resolve(ud, "files")), // saved original/redacted file blobs
    ],
  };
  return secretRead;
}
function isReadAllowed(p: string): boolean {
  const n = normPath(p);
  const secret = secretReadPaths();
  if (secret.files.has(n) || secret.dirs.some((d) => n === d || n.startsWith(d + sep))) return false;
  if (readGrants.has(n)) return true;
  userDataRoot ??= normPath(app.getPath("userData"));
  if (n === userDataRoot || n.startsWith(userDataRoot + sep)) return true;
  // OS tmpdir: ONLY the app's OWN temp files (the brand slug prefix), never another app's
  // dumped secrets. A user-picked temp file goes through `readGrants` above.
  tmpRoot ??= normPath(tmpdir());
  if (n.startsWith(tmpRoot + sep)) {
    const firstSeg = n.slice(tmpRoot.length + 1).split(sep)[0] ?? "";
    return firstSeg.toLowerCase().startsWith(BRAND.slug);
  }
  return false;
}

/** Throw unless {@link isReadAllowed}. The fail-closed gate on every by-path file read
 *  (`files:read`/`files:extract`/`files:redact-and-save`). */
export function assertReadAllowed(p: string): void {
  if (!isReadAllowed(p)) {
    throw new Error("Accès fichier refusé : chemin non autorisé.");
  }
}
