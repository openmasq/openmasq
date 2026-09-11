// Opening the live console in the system browser, on request (`--open`). It exists because a
// wrapped tool takes the screen the moment it starts — hermes and claude both begin with a
// clear — so the URL printed on the card, token included, is gone before it can be clicked.
// Opening it BEFORE the tool starts is the one moment that URL is both known and readable.
//
// The platform's own opener, nothing else: no HTTP, no library. Best-effort, like the
// clipboard (`ui/keys.ts`): a machine with no opener gets a note, never a crash.
import { spawn } from "node:child_process";

/** The command that hands a URL to the default browser on this platform. */
export function openerCommand(url: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "darwin") return ["open", url];
  // `start` is a cmd builtin; the empty string is the window title it would otherwise eat.
  if (platform === "win32") return ["cmd", "/c", "start", "", url];
  return ["xdg-open", url];
}

/** Resolves true when the opener was launched; false when none answered. Detached, silent:
 *  a browser's stderr has no business in the proxy's terminal. */
export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const [cmd, ...args] = openerCommand(url, platform);
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd as string, args, { stdio: "ignore", detached: true });
      p.on("error", () => resolve(false));
      p.on("spawn", () => {
        p.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
