import { ipcMain } from "electron";
import { webFetchMany } from "./webFetchMany";
import { fetchOpenRouterModels } from "./openrouterModels";

/**
 * IPC for the batch web reader (`web:fetch-many`) — the parallel alternative to the CDP
 * agent browser. The renderer's agent loop passes ALREADY-UN-REDACTED (real) URLs and
 * re-redacted the returned text itself; main only fetches them concurrently over the
 * hardened `safeFetch` egress path (http(s), SSRF per hop, IP-pinned, size/timeout caps,
 * text/data Content-Types) and extracts readable text. Fail-closed PER URL — never throws.
 */
export function registerWebIpc(): void {
  ipcMain.handle("web:fetch-many", (_e, urls: unknown) => webFetchMany(urls));
  // Live OpenRouter model catalogue. Returns [] on ANY failure so the renderer's guard
  // keeps the static baseline — a broken catalogue must never surface as an app error.
  ipcMain.handle("models:list-openrouter", async () => {
    try {
      return await fetchOpenRouterModels();
    } catch {
      return [];
    }
  });
}
