import { useEffect, useState } from "react";
import { useHost } from "../../../host";
import { dirOf } from "../../../state/files/localFsPaths";
import { watchDir } from "../../../state/files/watchDirs";

/**
 * A counter that increases every time the folder holding `path` changes on disk.
 *
 * This is what makes « le modèle écrit, vous voyez » literal: when the assistant edits a
 * file through its filesystem tools, the panel the user is looking at re-reads on its own.
 * No polling, no refresh button, no "re-open it to see".
 *
 * It watches the DIRECTORY, not the file: an editor (and our own atomic write) replaces a
 * file by renaming a temp over it, which destroys the inode a file-watch was holding — the
 * watch would fire once and then go deaf, exactly when it matters most.
 */
export function useLiveFile(path: string): number {
  const host = useHost();
  const fs = host.localFs;
  const [rev, setRev] = useState(0);
  const dir = dirOf(path);

  useEffect(() => {
    if (!fs || !dir) return;
    return watchDir(fs, dir, () => setRev((n) => n + 1));
  }, [fs, dir]);

  return rev;
}
