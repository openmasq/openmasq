import { dialog } from "electron";
// Via the barrel, not via `./server/lifecycle`: it's the public surface of the family, and
// short-circuiting it leaves a re-export that nothing reaches anymore (knip counts it
// as dead code — rightly so).
import { notePickedDir } from "./server";
import { withAgentBrowserHidden } from "./browser";

/**
 * The native folder picker for an MCP path grant — the user GRANTS the
 * folder, it's a capability, not a setting.
 *
 * `hint` only pre-positions the dialog on a folder that was just DROPPED. It
 * comes from the renderer, so it isn't trusted — and it's harmless, because it
 * grants nothing: the grant is `notePickedDir` on what the dialog RETURNS. A forged
 * hint opens the picker in the wrong place, and that's the full extent of its power. Non-string ⇒ ignored.
 *
 * ⚠️ E2E hook, twin of `OPENMASQ_E2E_ATTACH`: a native picker can't be automated,
 * so a journey driver designates here the folder the user "would have chosen".
 * Double LAUNCH ENV guard — a renderer can't write the main process's
 * env, so an XSS can't self-grant a folder. And the path goes through
 * `notePickedDir` like a real choice: the grant isn't short-circuited, it's produced
 * without a dialog. Inert without both variables (so in production).
 */
export async function pickGrantDir(hint: unknown): Promise<string | undefined> {
  if (process.env.OPENMASQ_E2E && process.env.OPENMASQ_E2E_PICK_DIR) {
    const dir = process.env.OPENMASQ_E2E_PICK_DIR;
    notePickedDir(dir);
    return dir;
  }
  const defaultPath = typeof hint === "string" && hint ? hint : undefined;
  const r = await withAgentBrowserHidden(() =>
    dialog.showOpenDialog({
      properties: ["openDirectory"],
      ...(defaultPath ? { defaultPath } : {}),
    }),
  );
  if (r.canceled || !r.filePaths[0]) return undefined;
  // Record the pick so mcpAddStdio will accept it as a path grant (audit M-4).
  notePickedDir(r.filePaths[0]);
  return r.filePaths[0];
}
