import { createContext, useContext } from "react";

/**
 * How a LOCAL file path in a message can be opened. Desktop-only by construction:
 * `openLocalPath` is provided ONLY when `host.localFs` exists (the granted-folders
 * bridge) — absent, the markdown leaf draws no affordance at all, which is the
 * documented degradation for this slot (`host/CLAUDE.md`).
 *
 * `isOpenablePath` is the UX gate: true only for a path inside a GRANTED root
 * (`rootOf` over `host.localFs.roots()`), so the icon never invites a click that
 * main's grant gate would refuse. It is pure and IPC-free per call — the roots are
 * fetched once and cached (`useLocalFsRoots`). It is UX ONLY: main re-resolves every
 * read against the grant (`fs/grant.ts`), the renderer never decides access.
 *
 * Same shape and rationale as `linkOpen.tsx` (the sanctioned leaf→context pattern:
 * a no-op default keeps `MarkdownMark` mountable everywhere).
 */
export interface FileOpenApi {
  /** Open the file in the right-hand panel viewer (`panelOpenLocalFile`). */
  openLocalPath?: (path: string) => void;
  /** True when the path sits inside a granted local-fs root (draw the icon). */
  isOpenablePath?: (path: string) => boolean;
}

const FileOpenContext = createContext<FileOpenApi>({});

export const FileOpenProvider = FileOpenContext.Provider;

/** The local-file open controls (panel opener + grant-scoped visibility gate). */
export function useFileOpen(): FileOpenApi {
  return useContext(FileOpenContext);
}
