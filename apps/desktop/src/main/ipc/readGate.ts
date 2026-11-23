import { app } from "electron";
import { tmpdir } from "node:os";
import { resolve, sep } from "path";
import { BRAND } from "@openmasq/branding";
import { isWithin, isWithinDenied, realPathOrNull } from "../security/pathScope";
import { openPinned } from "../security/pinnedOpen";

// ── files:read confinement ───────────────────────────────────────────────────
// The renderer may only read a path the USER granted this session, or one inside our own
// userData / temp dir, never an arbitrary path (an XSS would exfiltrate the keys, the vault,
// ~/.ssh). Module-level state so the grant and the later check share the SAME Set.
// Paths are compared in their ON-DISK casing and the secret deny is case-folded where the
// volume ignores case (`../security/pathScope.ts`): `<userData>/KEYS.ENC` IS `keys.enc`.
const readGrants = new Set<string>();
const normPath = (p: string): string => realPathOrNull(p) ?? resolve(p);

/** Grant reading a path this session — the user just picked it via the native dialog
 *  (or an E2E fixture env). A later {@link assertReadAllowed} for it then passes. */
export function grantRead(p: string): void {
  readGrants.add(normPath(p));
}

let userDataRoot: string | null = null;
let tmpRoot: string | null = null;
let secretRead: { files: string[]; dirs: string[] } | null = null;
// The at-rest SECRETS inside userData are denied unconditionally, even though userData is a
// read root (dev-plaintext keys, the DB key, the session, the vault DBs).
function secretReadPaths(): { files: string[]; dirs: string[] } {
  if (secretRead) return secretRead;
  const ud = app.getPath("userData");
  secretRead = {
    files: ["keys.enc", "db-key.enc", "auth.enc", "sync-pass.enc", "mcp.json"].map((f) => normPath(resolve(ud, f))),
    dirs: [
      normPath(resolve(ud, "accounts")), // vault DBs (openmasq-<uid>.db) + mcp-<uid>.json
      normPath(resolve(ud, "broker")), // CDP pipe→ws broker secret
      normPath(resolve(ud, "agent-browser")), // isolated browser profile: cookies of the authenticated SaaS
      normPath(resolve(ud, "files")), // saved original/redacted file blobs
    ],
  };
  return secretRead;
}
/** The gate as a predicate, for a read that re-checks it on the open descriptor (`openPinned`). */
export function isReadAllowed(p: string): boolean {
  const n = normPath(p);
  const secret = secretReadPaths();
  // A secret FILE is matched like a dir: a path beneath a file cannot exist, so this only
  // ever adds the folded exact match.
  if ([...secret.files, ...secret.dirs].some((d) => isWithinDenied(d, n))) return false;
  if (readGrants.has(n)) return true;
  userDataRoot ??= normPath(app.getPath("userData"));
  if (isWithin(userDataRoot, n)) return true;
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

/**
 * A gated READ: the gate decides on the REAL path and is re-checked on the open descriptor
 * (`../security/pinnedOpen.ts`: no link in any component, same dev/ino), sized on the
 * descriptor. A regular file only: a FIFO would hold main forever. `tooLarge` past `maxBytes`.
 */
export async function readAllowedFile(p: string, maxBytes = Infinity, tooLarge = () => new Error("Fichier trop volumineux.")): Promise<Uint8Array> {
  assertReadAllowed(p);
  const { fh, st } = await openPinned(p, isReadAllowed);
  try {
    if (st.size > maxBytes) throw tooLarge();
    return new Uint8Array(await fh.readFile());
  } finally {
    await fh.close();
  }
}
