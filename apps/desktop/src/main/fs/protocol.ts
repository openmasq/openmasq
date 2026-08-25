/**
 * The worker wire protocol — and the ONE thing that keeps the two consumers apart.
 *
 * The same worker (and the same `grant.ts` gate) serves two callers with very different
 * trust profiles: the MODEL, through the MCP tool surface, and the USER, through the
 * Bibliothèque's folder browser. `surface` is what tells them apart, and the worker looks
 * the op up in a DIFFERENT map per surface — so a tool name the model supplies can never
 * reach a UI-only op (`trash`, raw-byte `read`), which is exactly why neither is exposed
 * as an MCP tool. `LocalFsConnection.callTool` hard-codes `"tool"`; the UI path hard-codes
 * `"ui"`. Neither ever takes the surface from its caller.
 */

/** A directory entry as the folder browser sees it. Structurally mirrors
 *  `@openmasq/ui` `LocalFsEntry`; the renderer Host assembly typechecks the parity. */
export interface FsEntry {
  name: string;
  /** Absolute REAL path (post-`grant.resolve`), so a later op re-resolves to itself. */
  path: string;
  kind: "dir" | "file" | "link";
  size: number;
  /** Epoch ms. */
  mtime: number;
}

/** What `list` answers: the resolved directory plus its (bounded) entries. */
export interface FsListing {
  path: string;
  entries: FsEntry[];
  /** True when the directory held more entries than the cap — the UI says so rather
   *  than silently presenting a partial folder as complete. */
  truncated: boolean;
}

/** What `read` answers: base64 bytes, so one op serves text, images and PDFs alike. */
export interface FsBytes {
  base64: string;
  size: number;
}

/**
 * `find_files` is answered in TWO halves — the worker walks, MAIN ranks (it owns the
 * on-device embedder) — so the candidate list crosses this wire: one absolute path per
 * line, plus this marker as the LAST line when the walk hit its cap. Deliberately not
 * an absolute path, so it can never be mistaken for a candidate; and it lives here
 * rather than beside either half, because `toolOps.ts` runs in a plain-Node worker that
 * must never import the Electron-bound main side.
 */
export const FIND_TRUNCATED_MARKER = "[tronqué]";

export type FsSurface = "tool" | "ui";

export interface FsReq {
  id: number;
  surface: FsSurface;
  op: string;
  args: Record<string, unknown>;
}

export type FsRes =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string };

/** Unsolicited push from the watcher — the browsed directory changed on disk. */
export interface FsEvent {
  event: "changed";
  path: string;
}

export type FsMsg = FsRes | FsEvent;

export const isFsEvent = (m: FsMsg): m is FsEvent => "event" in m;
