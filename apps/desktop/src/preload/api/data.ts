import { ipcRenderer, webUtils } from "electron";

/** Turso/libSQL persistence (no-ops when not configured). */
export const db = {
  configured: (): Promise<boolean> => ipcRenderer.invoke("db:configured"),
  // Point the local DB at the signed-in account's file (per-account isolation).
  setUser: (userId: string | null): Promise<void> =>
    ipcRenderer.invoke("db:set-user", userId),
  load: (): Promise<{ conversations: unknown[]; settings: unknown } | null> =>
    ipcRenderer.invoke("db:load"),
  saveConversation: (conv: unknown): Promise<void> =>
    ipcRenderer.invoke("db:save-conversation", conv),
  deleteConversation: (id: string): Promise<void> =>
    ipcRenderer.invoke("db:delete-conversation", id),
  saveSettings: (settings: unknown): Promise<void> =>
    ipcRenderer.invoke("db:save-settings", settings),
  // Debug journal ring (real PII) — per-account encrypted DB is its ONLY at-rest home.
  saveDebugJournal: (json: string): Promise<void> =>
    ipcRenderer.invoke("db:save-debug-journal", json),
  loadDebugJournal: (): Promise<string | null> =>
    ipcRenderer.invoke("db:load-debug-journal"),
  // The EGRESS journal — read-only. Main is the sole writer; there is no setter and no
  // clear, so a renderer XSS can read the record but never author or erase it.
  listEgress: (
    limit?: number,
  ): Promise<
    { at: number; origin: string; source: string; verdict: "allowed" | "refused"; reason?: string }[]
  > => ipcRenderer.invoke("egress:list", limit),
  saveFile: (file: unknown): Promise<void> =>
    ipcRenderer.invoke("files:save", file),
  listFiles: (conversationId: string): Promise<unknown[]> =>
    ipcRenderer.invoke("files:list", conversationId),
  loadFile: (id: string): Promise<unknown> => ipcRenderer.invoke("files:load", id),
  deleteFile: (id: string): Promise<void> => ipcRenderer.invoke("files:delete", id),
  conversationsForFile: (hash: string): Promise<string[]> =>
    ipcRenderer.invoke("files:conversations", hash),
  openFile: (id: string): Promise<boolean> => ipcRenderer.invoke("files:open", id),
};

/** MÉMOIRE semantic index — ON-DEVICE embeddings (bundled e5-small; never the remote
 *  embeddings endpoint above: a memory card is real PII). */
export const memoryIndex = {
  sync: (
    cards: { id: string; text: string }[],
  ): Promise<{ available: boolean; total: number; indexed: number }> =>
    ipcRenderer.invoke("memory:index-sync", cards),
  edges: (k?: number): Promise<{ a: string; b: string; sim: number }[]> =>
    ipcRenderer.invoke("memory:index-edges", k),
  query: (text: string, k?: number): Promise<{ id: string; sim: number }[]> =>
    ipcRenderer.invoke("memory:index-query", text, k),
};

/** Embeddings: generate + store / semantic search (local libSQL vectors). */
export const embeddings = {
  index: (payload: {
    text: string;
    messageId?: string;
    conversationId?: string;
    config: { model: string; baseUrl: string; apiKey?: string };
  }): Promise<void> => ipcRenderer.invoke("embeddings:index", payload),
  search: (payload: {
    query: string;
    k?: number;
    conversationId?: string;
    config: { model: string; baseUrl: string; apiKey?: string };
  }): Promise<
    {
      id: string;
      messageId: string | null;
      conversationId: string | null;
      content: string;
      distance: number;
    }[]
  > => ipcRenderer.invoke("embeddings:search", payload),
};

/** Progression OCR pendant une extraction : `{name, page, pages}` par page lue. */
export type OcrProgress = { name: string; page: number; pages: number };

/** Écoute `files:ocr-progress` LE TEMPS d'une invoke (le modèle de `python.run` :
 *  abonnement scopé par appel, désabonné au settle). Le canal est global, la charge
 *  porte le nom du fichier — l'appelant filtre s'il extrait plusieurs fichiers. */
const withOcrProgress = <T>(
  invoke: () => Promise<T>,
  onProgress?: (p: OcrProgress) => void,
): Promise<T> => {
  if (!onProgress) return invoke();
  const listener = (_e: unknown, p: OcrProgress) => onProgress(p);
  ipcRenderer.on("files:ocr-progress", listener);
  return invoke().finally(() => ipcRenderer.removeListener("files:ocr-progress", listener));
};

/** Extract text from attached files (for local redaction before sending). */
export const files = {
  pick: (): Promise<
    { name: string; kind: string; text: string; chars: number; error?: string }[]
  > => ipcRenderer.invoke("files:pick"),
  // Dialog only (no extraction) → the renderer shows a chip instantly, then extracts.
  pickPaths: (): Promise<{ name: string; path: string }[]> =>
    ipcRenderer.invoke("files:pick-paths"),
  extract: (
    paths: string[],
    onProgress?: (p: OcrProgress) => void,
  ): Promise<
    { name: string; kind: string; text: string; chars: number; error?: string }[]
  > => withOcrProgress(() => ipcRenderer.invoke("files:extract", paths), onProgress),
  // « Lire tout » : la même extraction, plafond d'OCR levé — voir registerFilesIpc.
  extractAll: (
    paths: string[],
    onProgress?: (p: OcrProgress) => void,
  ): Promise<
    { name: string; kind: string; text: string; chars: number; error?: string }[]
  > => withOcrProgress(() => ipcRenderer.invoke("files:extract-all", paths), onProgress),
  read: (path: string): Promise<Uint8Array> => ipcRenderer.invoke("files:read", path),
  extractBytes: (
    data: string,
    name: string,
    mime?: string,
    onProgress?: (p: OcrProgress) => void,
    // Structuré (texte + words/ocrText/ocr/ocrPages) : la route bytes rend la même
    // richesse que la route chemin — l'aperçu d'un drop en dépend.
  ): Promise<{ text: string } & Record<string, unknown>> =>
    withOcrProgress(
      () => ipcRenderer.invoke("files:extract-bytes", { data, name, mime }),
      onProgress,
    ),
  redactAndSave: (p: unknown): Promise<Record<string, string>> =>
    ipcRenderer.invoke("files:redact-and-save", p),
  fetchUrl: (url: string): Promise<{ path: string; name: string; mime: string }> =>
    ipcRenderer.invoke("files:fetch-url", url),
  /**
   * The on-disk path of a DROPPED item (`File.path` was removed in Electron 32+).
   *
   * ⚠️ This is NOT a read capability and must never become one. The renderer already
   * holds the dropped file's BYTES, so a path buys nothing for a file — the only caller
   * uses it on a dropped FOLDER, to pre-position the native picker. Handing this path to
   * a read/grant IPC would be the arbitrary-disk-read hole `ipc/readGate.ts` exists to
   * close. Synchronous and local: no IPC, nothing privileged.
   */
  pathForFile: (file: File): string | undefined => {
    try {
      return webUtils.getPathForFile(file) || undefined;
    } catch {
      return undefined;
    }
  },
};
