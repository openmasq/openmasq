import { ipcMain } from "electron";
import { setLocalFsChangeNotifier } from "./ipc/registerLocalFsIpc";
import { withMainWindow, getMainWindow } from "./mainWindowRef";
import { setMcpChangeNotifier, setMcpNeedsReconnectNotifier, setMcpOauthUrlNotifier, setMcpAuthChoiceAsker, type McpAuthChoice } from "./mcp";

// Monotonic id correlating an `mcp:auth-choice` request with its reply channel.
let authChoiceSeq = 0;
/**
 * How main TALKS BACK to the renderer outside a request: connector changes, folders that
 * changed on disk, reconnect needs, OAuth URLs to open, and the one QUESTION main asks
 * (account or anonymous for a connector). All go through the current window, or nowhere.
 */
export function installMainNotifiers(): void {
  // Push live MCP state changes to the renderer so a connector reconnected in the
  // background (below) stops showing as "disconnected" without a manual refresh.
  setMcpChangeNotifier(() => withMainWindow((w) => w.webContents.send("mcp:changed")));
  // The browsed folder changed on disk → the Bibliothèque re-lists it. Same shape as
  // `mcp:changed`: main pushes, the renderer re-fetches.
  setLocalFsChangeNotifier((path) => withMainWindow((w) => w.webContents.send("localfs:changed", path)));
  // A remote connector whose backend dropped the transport is torn down in main and
  // reported here so the renderer can show a bottom "reconnexion nécessaire" banner.
  setMcpNeedsReconnectNotifier((items) => withMainWindow((w) => w.webContents.send("mcp:needs-reconnect", items)));
  // The OAuth authorize URL of an in-flight connect → the renderer's "Copier le lien"
  // (open the login in another browser than the default `shell.openExternal` picked).
  setMcpOauthUrlNotifier((id, url) => withMainWindow((w) => w.webContents.send("mcp:oauth-url", { id, url })));
  // Ask the renderer (styled in-app modal) which access mode to use for a
  // dual-mode connector (Firecrawl…): the user's account vs anonymous. Replaces
  // the native OS popup. A destroyed window / no reply falls back to "anonymous".
  setMcpAuthChoiceAsker(
    (req) => new Promise<McpAuthChoice>((resolve) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return resolve("anonymous");
      const requestId = `mcp-auth-${++authChoiceSeq}`;
      let settled = false;
      const done = (choice: McpAuthChoice) => {
        if (settled) return;
        settled = true;
        ipcMain.removeListener(`mcp:auth-choice-reply:${requestId}`, onReply);
        win.webContents.removeListener("destroyed", onGone);
        resolve(choice);
      };
      const onReply = (_e: unknown, choice: unknown) => done(choice === "account" ? "account" : "anonymous");
      const onGone = () => done("anonymous");
      ipcMain.once(`mcp:auth-choice-reply:${requestId}`, onReply);
      win.webContents.once("destroyed", onGone);
      win.webContents.send("mcp:auth-choice", { requestId, id: req.id, name: req.name });
    })
  );
}
