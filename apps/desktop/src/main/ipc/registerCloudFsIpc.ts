import { ipcMain } from "electron";
import { cloudList, cloudSources } from "../cloudfs";

/**
 * `cloudfs:*` — browse a connected storage (Drive, OneDrive, Dropbox) from the "Folders"
 * panel, alongside local folders.
 *
 * The why and the security posture live with the code that governs them:
 * `../cloudfs/index.ts`. Here, just two house rules:
 *  - **an ENVELOPE rather than a throw**: `ipcRenderer.invoke` turns an error into
 *    "Error invoking remote method …", and the panel must show the real reason
 *    ("this storage isn't connected");
 *  - **no secret in the response**: file names and provider
 *    ids, never a token.
 */

type Envelope = { ok: true; data: unknown } | { ok: false; error: string };

const fail = (e: unknown): Envelope => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

export function registerCloudFsIpc(): void {
  ipcMain.handle("cloudfs:sources", async (): Promise<Envelope> => {
    try {
      return { ok: true, data: { sources: cloudSources() } };
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("cloudfs:list", async (_e, arg: unknown): Promise<Envelope> => {
    try {
      const { sourceId, folderId } = (arg ?? {}) as { sourceId?: unknown; folderId?: unknown };
      if (typeof sourceId !== "string") throw new Error("Source manquante.");
      // `null` = the account root. Everything else must be a string, validated further down
      // before entering a provider URL or a tool's argument.
      const folder = typeof folderId === "string" ? folderId : null;
      return { ok: true, data: await cloudList(sourceId, folder) };
    } catch (e) {
      return fail(e);
    }
  });
}
