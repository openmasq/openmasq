/**
 * A text handed to a CLI through a FILE, for what it cannot read on stdin (claude's
 * `--system-prompt-file`). The prompt itself never comes here: it rides on stdin
 * (`spawnStream.ts`), a pipe that only the child reads and that never touches the disk.
 *
 * What holds:
 * - never in argv (a command line is readable by any local process, `ps`, and capped by
 *   the OS: `spawnFailure.ts`);
 * - a directory of its own per turn (`mkdtemp`: 0700, unpredictable name), the file
 *   created EXCLUSIVELY (`wx`, never through a pre-planted path) in 0600;
 * - deleted as soon as the CLI has started answering (`onStarted`, its first output —
 *   measured on claude 2.1.326: the file is read before the first event), and again
 *   whatever ends the turn. `remove()` is idempotent and never throws.
 *
 * Residual, said: 0600 bounds the file to the user's ACCOUNT, not to one process — another
 * process of the same account can read it during those milliseconds. On Windows the mode
 * bits do not apply; the bound is the per-user temp folder's ACL. The content is what the
 * MODEL receives (redacted), never a vault or a key.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";

export interface PrivateFile {
  path: string;
  remove: () => void;
}

export function writePrivateFile(name: string, content: string, root: string = tmpdir()): PrivateFile {
  // Brand-prefixed: the app-owned tmp convention (`ipc/appTmpFile.ts`).
  const dir = mkdtempSync(join(root, `${BRAND.slug}-cli-input-`));
  const path = join(dir, name);
  try {
    writeFileSync(path, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  let removed = false;
  return {
    path,
    remove: () => {
      if (removed) return;
      removed = true;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort: the OS temp sweep is the last net, and the turn must not fail on it
      }
    },
  };
}
