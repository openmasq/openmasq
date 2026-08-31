import { app } from "electron";
import { existsSync } from "node:fs";
import { protocolAction } from "./deepLink";

/**
 * Register (or not) with the system as the handler for the app's deep-link scheme.
 *
 * A separate module because the LaunchServices registration is PERSISTENT: it survives
 * process exit, and a bogus declaration is paid for long after. The RULE
 * (who has the right) is pure and tested in `deepLink.ts`; what's left here is just the
 * Electron call and resolving the app path.
 *
 * ⚠️ `app.getAppPath()` and never argv ("." under electron-vite dev, so resolved against the
 * LAUNCHER's cwd): same fact, same source as `appEntry.ts`.
 */
export function registerProtocolClient(scheme: string): void {
  const entry = process.defaultApp ? app.getAppPath() : null;
  const devEntry = entry && existsSync(entry) ? entry : null;
  const action = protocolAction({
    packaged: !process.defaultApp,
    platform: process.platform,
    devEntry,
  });
  if (action === "register") {
    if (devEntry) app.setAsDefaultProtocolClient(scheme, process.execPath, [devEntry]);
    else app.setAsDefaultProtocolClient(scheme);
  } else if (action === "unregister") {
    // Repairs the developer's machine: the registration stolen by a previous `pnpm dev`
    // (often another worktree's) is removed on the next launch.
    app.removeAsDefaultProtocolClient(scheme);
  }
}
