import { useHost } from "../host";

/**
 * Does this PLATFORM know how to browse the machine's folders?
 *
 * ⚠️ The question used to be "is there something to browse?": it called `roots()`
 * and only answered yes if folders were ALREADY granted. The right panel used that
 * to decide whether to show itself — so a user with neither a local folder nor a
 * connected storage saw NOTHING, just "Web · No open tab". Yet that user is exactly
 * who needed the invitation, and both invitations already existed in the panel:
 * they were simply unreachable.
 *
 * `available:false` couldn't serve as the guard either — it means "the Files
 * connector isn't connected" (`host/localFs.ts`), which is precisely the state we
 * want to show. Only the CAPABILITY is left: a web preview or mobile don't have the
 * slot, and only there is there nothing to offer. The EMPTY state — no root, no
 * cloud — is rendered by `FolderTreePanel` / `StorageSources`, whose job that is.
 *
 * Intended side effect: no more `roots()` call nor `mcp.onChanged` subscription on
 * the rail's mount. The capability doesn't change mid-session; the old version
 * re-ran a listing on every connector change just to decide a simple display.
 */
export function useLocalFsCapable(): boolean {
  return !!useHost().localFs;
}
