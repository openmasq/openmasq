import { utilityProcess, type UtilityProcess } from "electron";
import { basename, join } from "node:path";
import { reportMainError } from "../runtime/errorReport";
import { isAppQuitting } from "../runtime/quitState";
import type { McpConnection, McpTool, McpToolCall, McpToolResult } from "@openmasq/mcp";
import { FS_TOOLS } from "./tools";
import { makeMainFsOps, type MainFsOps } from "./mainOps";
import { clearLiveFs } from "./live";
import { rankFindResults } from "./findFiles";
import { extractedNote, readRoute } from "./readRoute";
import { isFsEvent, type FsMsg, type FsSurface } from "./protocol";
import { BRAND } from "@openmasq/branding";

const CALL_TIMEOUT_MS = 30_000;

interface Pending {
  resolve: (d: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The in-process filesystem connector. Implements the {@link McpConnection} contract
 * by forking a `utilityProcess` worker ({@link ../fs/worker}) that runs the real fs ops
 * behind the grant gate — replacing the spawned `@modelcontextprotocol/server-filesystem`
 * (which needed ELECTRON_RUN_AS_NODE). `utilityProcess.fork` is NOT gated by the
 * `RunAsNode:false` fuse, keeps the ops in a SEPARATE process (bug isolation from the
 * vault/keys/IPC), and lets us own the code + a minimal env (no secrets leaked to it).
 *
 * It serves TWO surfaces over that one worker: `callTool` for the MODEL (MCP), and
 * {@link uiCall} for the Bibliothèque's folder browser. `surface` is stamped HERE, never
 * taken from a caller, which is what keeps the two op maps disjoint (`protocol.ts`).
 */
export class LocalFsConnection implements McpConnection {
  readonly id: string;
  /** The user-granted roots, as validated at connect time — the browser's top level. */
  readonly roots: readonly string[];
  private readonly deny: string[];
  private child: UtilityProcess | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private onChange: ((path: string) => void) | null = null;
  /** The last watched directory SET, remembered so a worker crash/restart re-installs it.
   *  Without this, watchers died silently with the child and live refresh went dark until
   *  the next subscriber change — the aperçu looked fine and simply stopped following. */
  private lastWatch: string[] = [];
  /** Bounded auto-restart after a crash WHILE watching (reset on any worker reply) —
   *  restores live refresh without risking a tight crash loop. */
  private restarts = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** `trash`/`open` need Electron's `shell`, unavailable in a utilityProcess. */
  readonly mainOps: MainFsOps;

  constructor(id: string, roots: string[], deny: string[] = []) {
    this.id = id;
    this.roots = roots;
    this.deny = deny;
    this.mainOps = makeMainFsOps(roots, deny);
  }

  /** Subscribe to the watched directory changing on disk. One sink; re-subscribing
   *  replaces it (the folder browser is a single view). */
  setChangeSink(cb: ((path: string) => void) | null): void {
    this.onChange = cb;
  }

  private ensureChild(): UtilityProcess {
    if (this.child) return this.child;
    const worker = join(__dirname, "fsWorker.js"); // emitted by electron-vite (main entry)
    const child = utilityProcess.fork(worker, [], {
      serviceName: `${BRAND.slug}-fs`,
      // MINIMAL env — only the grant config. The worker handles untrusted, model-
      // influenced paths; never leak app/provider secrets from process.env into it.
      env: { FS_ROOTS: JSON.stringify(this.roots), FS_DENY: JSON.stringify(this.deny) },
      stdio: "ignore",
    });
    child.on("message", (msg: FsMsg) => {
      this.restarts = 0; // the worker is alive and answering — re-arm the crash budget
      if (isFsEvent(msg)) {
        this.onChange?.(msg.path);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new Error(msg.error));
    });
    child.on("exit", (code) => {
      // Mort INATTENDUE seulement (une fermeture volontaire pose `closed` d'abord, la
      // fermeture de l'app passe par `isAppQuitting`) — rapportée NOMMÉE (audit 13/08).
      if (!this.closed && this.child === child && !isAppQuitting()) {
        reportMainError("fs", `worker-exit-${code ?? "?"}`, new Error(`fs-worker mort (code ${code})`));
      }
      this.child = null;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error("le worker filesystem s'est arrêté"));
      }
      this.pending.clear();
      // A crash while directories were watched: re-fork shortly (bounded) so live
      // refresh comes back on its own — the next send would re-fork anyway, but
      // nothing guarantees a send ever comes while the user is just LOOKING.
      if (!this.closed && this.lastWatch.length > 0 && this.restarts < 3 && !this.restartTimer) {
        this.restarts += 1;
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          if (!this.closed && !this.child) this.ensureChild();
        }, 1000);
      }
    });
    this.child = child;
    // Re-install the watchers a previous incarnation held — fire-and-forget (the reply's
    // id is not in `pending`, so it is ignored); a failure degrades to manual refresh,
    // exactly as before.
    if (this.lastWatch.length > 0) {
      child.postMessage({ id: ++this.seq, surface: "ui", op: "watch", args: { paths: this.lastWatch } });
    }
    return child;
  }

  /** Send one request on a given surface and await its reply. The surface is supplied by
   *  the two call sites below, both of which hard-code it. */
  private send(surface: FsSurface, op: string, args: Record<string, unknown>): Promise<unknown> {
    const child = this.ensureChild();
    const id = ++this.seq;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("délai dépassé (worker filesystem)"));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      child.postMessage({ id, surface, op, args });
    });
  }

  listTools(): Promise<McpTool[]> {
    return Promise.resolve(FS_TOOLS.map((t) => ({ ...t, serverId: this.id })));
  }

  async callTool(call: McpToolCall): Promise<McpToolResult> {
    try {
      // QUI lit — le worker ou l'extraction de MAIN — est décidé par `readRoute` (pur,
      // testé) : la scission `read_document` par format, ET le repli d'un `read_file`
      // lancé sur un document, que ce fichier explique.
      const path = call.arguments?.path;
      const route = readRoute(call.name, path);
      if (route === "main-extract") {
        const text = await this.mainOps.readDocument(String(path));
        const note = call.name === "read_file" ? extractedNote(basename(String(path))) : "";
        return { content: [{ type: "text", text: note + text }] };
      }
      // Un `.docx` demandé par `read_file` prend la MÊME op que `read_document` : c'est la
      // lecture par paragraphes que `edit_document` sait retrouver.
      const op = route === "docx-worker" ? "read_document" : call.name;
      const text = await this.send("tool", op, call.arguments ?? {});
      // `find_files` is the mirror case: the worker walks (it owns the gate and the
      // symlink rule), MAIN ranks — the on-device embedder is a main-process
      // utilityProcess a plain-Node worker cannot reach (`./findFiles.ts`).
      if (call.name === "find_files") {
        const query = call.arguments?.query;
        if (typeof query !== "string" || !query.trim()) {
          throw new Error("argument `query` requis (ce que l'on cherche, en clair)");
        }
        return { content: [{ type: "text", text: await rankFindResults(String(text), query) }] };
      }
      return { content: [{ type: "text", text: String(text) }] };
    } catch (err) {
      // A tool-level failure (denied path, not found, bad arg) comes back as an isError
      // RESULT so the model sees it and self-corrects — not a thrown transport error.
      return {
        content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  }

  /** The folder-browser surface. Unlike {@link callTool} a failure THROWS: the caller is
   *  the UI, which shows the real message to the user rather than feeding it to a model. */
  uiCall(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
    // Remember the watched set so a worker restart re-installs it (see `ensureChild`).
    if (op === "watch" && Array.isArray(args.paths)) {
      this.lastWatch = (args.paths as unknown[]).filter((p): p is string => typeof p === "string");
    }
    return this.send("ui", op, args);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    this.child = null;
    this.onChange = null;
    clearLiveFs(this); // the folder browser must not keep a handle on a dead worker
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("connexion fermée"));
    }
    this.pending.clear();
    if (child) {
      try {
        child.kill();
      } catch {
        /* best-effort */
      }
    }
  }
}
