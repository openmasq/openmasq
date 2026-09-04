import { app } from "electron";
import { rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";

/**
 * A DECRYPTED original, handed to the OS for a moment — and taken back.
 *
 * `files:open` and `files:fetch-url` must put real bytes on disk where `shell.openPath` (or
 * the viewer) can reach them, because the renderer is sandboxed and cannot. They wrote them
 * straight into `tmpdir()` with **no mode and no cleanup**, and both halves matter on a
 * shared machine: the default umask makes the file world-READABLE in a directory every local
 * account can list, and nothing ever deleted it. So each "open my payslip" left a permanent
 * cleartext copy of a document whose whole point is that `db/` keeps it encrypted at rest —
 * the at-rest guarantee undone from the side, one open at a time.
 *
 * The shape, mirroring `subscription/claudeToolsTurn.ts` (the app-owned tmp convention):
 * `mkdtemp` a directory — atomically created 0700, and unguessable, so the FILE inside can
 * keep the real name and extension the OS handler needs — the file 0600 inside it, and every
 * directory removed on `will-quit`.
 *
 * ⚠️ The `BRAND.slug` prefix is load-bearing, not cosmetic: `readGate.ts` allows a renderer
 * read under the OS temp dir ONLY when the first segment below it starts with the slug.
 */
const dirs = new Set<string>();
let quitHookInstalled = false;

/** Remove every directory this process created. Sync: `will-quit` does not await. */
export function cleanupAppTmpFiles(): void {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort — a locked file must never delay or block the quit */
    }
  }
  dirs.clear();
}

function installQuitHook(): void {
  if (quitHookInstalled) return;
  quitHookInstalled = true;
  // `will-quit`, not `before-quit`: it also fires on the paths that skip a window close.
  app.on("will-quit", cleanupAppTmpFiles);
}

/**
 * Write `bytes` to a private temp file named `name`, and return its path.
 * `tag` names the caller in the directory name (`<slug>-<tag>-XXXXXX`), so a leftover is
 * attributable. `name` MUST already be sanitised — it is spliced into a path.
 */
export async function writeAppTmpFile(
  tag: string,
  name: string,
  bytes: Uint8Array,
): Promise<string> {
  installQuitHook();
  const dir = await mkdtemp(join(tmpdir(), `${BRAND.slug}-${tag}-`));
  dirs.add(dir);
  const path = join(dir, name);
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}
