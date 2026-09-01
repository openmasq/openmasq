/**
 * Optional LOCAL-FOLDER browsing — the Bibliothèque's « Dossiers » tab, reading the
 * folders the user granted to the **Filesystem** connector.
 *
 * WHY THIS IS NOT `host.mcp.callTool`. MCP is a model-facing protocol: its results are
 * prose an LLM reads (`"[DIR] foo"`, no size, no date), every call is wrapped in the
 * conversation's redaction vault — and this surface must show the user their REAL files,
 * never a placeholder (root rule 11 governs what the MODEL sees, nothing else) — and its
 * `read_file` is utf8-only, so an image or a PDF has no preview. Same grant, same worker,
 * same gate; a shape fit for a UI instead of for a prompt.
 *
 * ABSENT ⇒ DEGRADE. No slot (browser preview, mobile) or `available:false` (the connector
 * isn't connected, so there are no granted folders) ⇒ the tab is not drawn at all. This is
 * a convenience, not a security guarantee the user selected, so hiding it is the correct
 * degradation — nothing here may fail closed onto a different data source.
 *
 * EVERY PATH IS RE-RESOLVED IN MAIN. The renderer is untrusted: it may pass any string,
 * and main's grant gate proves it stays inside a granted root and outside every denied
 * subtree (symlinks resolved, escapes rejected). A path returned by `list` is already the
 * REAL path, so a later op on it resolves to itself.
 */
export interface LocalFsEntry {
  name: string;
  /** Absolute real path — pass it back verbatim to any other method. */
  path: string;
  kind: "dir" | "file" | "link";
  size: number;
  /** Epoch ms; 0 when the entry vanished or is unreadable. */
  mtime: number;
}

export interface LocalFsHost {
  /** The granted roots. `available:false` ⇒ the connector isn't connected; show nothing. */
  roots(): Promise<{ available: boolean; roots: string[] }>;
  /** One directory. `truncated` ⇒ the folder held more than the cap; say so rather than
   *  presenting a partial listing as complete. */
  list(path: string): Promise<{ path: string; entries: LocalFsEntry[]; truncated: boolean }>;
  stat(path: string): Promise<LocalFsEntry>;
  /** Raw bytes as base64 — one op for text, images and PDFs. Rejects past a size cap
   *  (the preview crosses IPC); offer « Ouvrir dans l'application » instead. */
  read(path: string): Promise<{ base64: string; size: number }>;
  /**
   * Text AND OCR geometry of a document, in ONE round trip.
   *
   * ⚠️ Optional, and its absence isn't neutral: without it, the bytes must be read then
   * SENT BACK to the platform for extraction — the file crosses the boundary twice
   * and the geometry gets lost along the way, so a scan displays without its redaction boxes.
   * The fallback exists (web preview), it's simply not as good; it degrades no
   * guarantee, only speed and rendering.
   *
   * Never returns `path`: what holds for `read` holds here — a path handed back to the renderer
   * is a path an XSS replays to read files.
   */
  extract?(path: string): Promise<Record<string, unknown>>;
  /** Recursive name search under `path`, bounded in depth and count. */
  search(path: string, query: string): Promise<{ entries: LocalFsEntry[]; truncated: boolean }>;
  // NOTE: no `write` — the UI surface is deliberately read-only on file CONTENT
  // (in-app editing via the sidebar was removed); tree ops below stay.
  mkdir(path: string): Promise<{ path: string }>;
  /** Rename/move. BOTH ends are re-resolved, so it can never move a file out of the
   *  granted folders. */
  rename(source: string, destination: string): Promise<{ path: string }>;
  /** OS trash — **reversible by construction**, never an unlink. That is precisely why a
   *  delete the user clicks doesn't demand its own un-spoofable prompt. */
  trash(path: string): Promise<unknown>;
  /** Hand the file to the OS default application. */
  open(path: string): Promise<unknown>;
  /** Replace the watched SET of directories, so both the folder listing AND the open file
   *  refresh when something changes on disk — including when the MODEL writes. The call is
   *  a full replacement (an empty list stops everything) and the platform bounds the count.
   *  Optional — absent ⇒ everything still works, it just needs a manual refresh. */
  watch?(paths: string[]): Promise<{ watching: string[] }>;
  /** Subscribe to the watched directory changing. Returns an unsubscribe fn. */
  onChanged?(cb: (path: string) => void): () => void;
}
