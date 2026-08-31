import { ipcMain } from "electron";
import { getLiveFs } from "../fs/live";
import { assertLocalFsWriteAllowed, type LocalFsWriteOp } from "../fs/uiGate";

/**
 * `localfs:*` — the Bibliothèque's folder browser.
 *
 * A SECOND consumer of the filesystem connector, alongside the model's MCP tools. It is a
 * separate IPC family rather than a route through `mcp:call-tool` because MCP is a
 * model-facing protocol: its results are prose for an LLM (`"[DIR] foo"`), every call is
 * wrapped in the conversation's redaction vault (the user must see their REAL file), and
 * `read_file` is utf8-only (no aperçu of an image or a PDF). Same grant, different shape.
 *
 * SECURITY — what this does and does not widen:
 *  - **Reading is parity.** The renderer can already enumerate and read these roots via
 *    `mcp.callTool("filesystem__read_file")`. `list`/`read`/`search`/`stat` add ergonomics,
 *    not reach. Everything still resolves through `fs/grant.ts` — inside a granted root,
 *    outside every denied subtree, symlinks resolved and rejected on escape.
 *  - **Writing is held to the existing posture** by `fs/uiGate.ts` (the shared
 *    `confirmationSurface` policy + main's un-spoofable window), so this is not a way
 *    around the write gate that already covers `filesystem__write_file`.
 *  - **`trash` and raw-byte `read` exist ONLY here**, deliberately: neither is an MCP tool,
 *    so the model has no way to reach them. `trash` is `shell.trashItem`, never `unlink` —
 *    a delete the user clicks stays recoverable from the OS Corbeille.
 *  - **Absent connector ⇒ absent capability.** No live connection means no grants, and
 *    every handler answers `available:false` rather than inventing a root.
 */

/** Push sink for the watcher (wired to the window in `index.ts`, like `mcp:changed`). */
let notifyChanged: ((path: string) => void) | null = null;
export function setLocalFsChangeNotifier(fn: (path: string) => void): void {
  notifyChanged = fn;
}

/** Handlers answer an envelope instead of throwing: `ipcRenderer.invoke` mangles a thrown
 *  Error into "Error invoking remote method …", and the folder browser shows the real
 *  message to the user (a refused path, a full disk). The preload unwraps it. */
type Envelope = { ok: true; data: unknown } | { ok: false; error: string };

const fail = (e: unknown): Envelope => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

const NO_CONNECTOR = "Le connecteur Filesystem n'est pas connecté.";

/** Run a worker op on the live connection, or report the connector as absent. */
async function run(op: string, args: Record<string, unknown>): Promise<Envelope> {
  const conn = getLiveFs();
  if (!conn) return { ok: false, error: NO_CONNECTOR };
  try {
    return { ok: true, data: await conn.uiCall(op, args) };
  } catch (e) {
    return fail(e);
  }
}

/** Same, for a MUTATING op: the confirmation gate runs FIRST and a refusal never reaches
 *  the worker. */
async function runGated(
  gate: LocalFsWriteOp,
  op: string,
  args: Record<string, unknown>,
): Promise<Envelope> {
  const conn = getLiveFs();
  if (!conn) return { ok: false, error: NO_CONNECTOR };
  try {
    await assertLocalFsWriteAllowed(gate, args);
    return { ok: true, data: await conn.uiCall(op, args) };
  } catch (e) {
    return fail(e);
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function registerLocalFsIpc(): void {
  // Availability + the granted roots in one call: the UI needs both to decide whether to
  // draw the tab at all, and they can only ever be true together.
  ipcMain.handle("localfs:roots", async (): Promise<Envelope> => {
    const conn = getLiveFs();
    if (!conn) return { ok: true, data: { available: false, roots: [] } };
    return { ok: true, data: { available: true, roots: [...conn.roots] } };
  });

  ipcMain.handle("localfs:list", (_e, p: { path: string }) => run("list", { path: str(p?.path) }));
  ipcMain.handle("localfs:stat", (_e, p: { path: string }) => run("stat", { path: str(p?.path) }));
  ipcMain.handle("localfs:read", (_e, p: { path: string }) => run("read", { path: str(p?.path) }));
  ipcMain.handle("localfs:search", (_e, p: { path: string; query: string }) =>
    run("search", { path: str(p?.path), query: str(p?.query) }),
  );

  // No `localfs:write` — in-app file editing via the sidebar was removed, so the UI
  // surface exposes no in-place overwrite at all (the model's gated `write_file` is
  // the one write path that remains).
  ipcMain.handle("localfs:mkdir", (_e, p: { path: string }) =>
    runGated("mkdir", "mkdir", { path: str(p?.path) }),
  );
  ipcMain.handle("localfs:rename", (_e, p: { source: string; destination: string }) =>
    runGated("rename", "rename", { source: str(p?.source), destination: str(p?.destination) }),
  );

  // `trash` and `open` need Electron's `shell`, which a utilityProcess child does not have
  // — they run in main against the SAME gate (`fs/mainOps.ts`), never on a second policy.
  ipcMain.handle("localfs:trash", async (_e, p: { path: string }): Promise<Envelope> => {
    const conn = getLiveFs();
    if (!conn) return { ok: false, error: NO_CONNECTOR };
    try {
      await assertLocalFsWriteAllowed("trash", { path: str(p?.path) });
      await conn.mainOps.trash(str(p?.path));
      return { ok: true, data: null };
    } catch (e) {
      return fail(e);
    }
  });

  // Extraction runs in MAIN for the same reason as `trash`/`open`: the pipeline (pdf.js,
  // docTR/Tesseract OCR) lives there, a bare Node utilityProcess can't do it. Same gate,
  // second caller — never a second policy.
  ipcMain.handle("localfs:extract", async (_e, p: { path: string }): Promise<Envelope> => {
    const conn = getLiveFs();
    if (!conn) return { ok: false, error: NO_CONNECTOR };
    try {
      return { ok: true, data: await conn.mainOps.extractDocument(str(p?.path)) };
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("localfs:open", async (_e, p: { path: string }): Promise<Envelope> => {
    const conn = getLiveFs();
    if (!conn) return { ok: false, error: NO_CONNECTOR };
    try {
      await conn.mainOps.open(str(p?.path));
      return { ok: true, data: null };
    } catch (e) {
      return fail(e);
    }
  });

  // Live refresh — what makes a model's write visible without the user doing anything.
  // The renderer sends the FULL set it wants watched (the browsed folder, the open file's
  // folder); an empty list stops everything. Bounded in the worker.
  ipcMain.handle("localfs:watch", async (_e, p: { paths: string[] }): Promise<Envelope> => {
    const conn = getLiveFs();
    if (!conn) return { ok: false, error: NO_CONNECTOR };
    conn.setChangeSink((changed) => notifyChanged?.(changed));
    const paths = Array.isArray(p?.paths) ? p.paths.filter((x) => typeof x === "string") : [];
    return run("watch", { paths });
  });
}
