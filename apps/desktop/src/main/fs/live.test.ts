import { describe, it, expect, beforeEach, vi } from "vitest";

// `LocalFsConnection` forks a utilityProcess and `mainOps` needs `shell`; neither is
// exercised here — we only ever look at the roots a connection carries.
vi.mock("electron", () => ({
  utilityProcess: { fork: () => ({ on: () => {}, postMessage: () => {}, kill: () => {} }) },
  shell: { trashItem: async () => {}, openPath: async () => "" },
  // `on`: `runtime/quitState.ts` (imported by fs/connection) registers `before-quit`
  // on module load — the mock must accept it like the real `app`.
  app: { getPath: () => "/tmp/openmasq-test-userdata", on: () => {} },
}));

import { LocalFsConnection } from "./connection";
import { clearLiveFs, getLiveFs, setLiveFs } from "./live";

/**
 * WHY THIS EXISTS — a real failure: adding a folder in Réglages left it invisible to the
 * model until the app was restarted. The spec was persisted correctly, but the worker
 * receives its roots through `FS_ROOTS` **at fork**, once, and `connectServer` short-circuits
 * on an already-connected connector — so nothing was rebuilt and the old perimeter stayed.
 *
 * The property that has to hold, whatever the plumbing above does: **the live handle
 * carries the CURRENT grant**. If it ever carries a stale one again, the model reads the
 * wrong set of folders and the only symptom is « il ne le trouve pas ».
 */
const conn = (roots: string[]): LocalFsConnection => new LocalFsConnection("local-filesystem", roots);

beforeEach(() => {
  const live = getLiveFs();
  if (live) clearLiveFs(live);
});

describe("la poignée vivante porte le périmètre COURANT", () => {
  it("une reconstruction remplace les racines", () => {
    setLiveFs(conn(["/a"]));
    expect([...getLiveFs()!.roots]).toEqual(["/a"]);

    // What `mcp:set-dirs` does: destroy, then rebuild with the new perimeter.
    setLiveFs(conn(["/a", "/b"]));
    expect([...getLiveFs()!.roots]).toEqual(["/a", "/b"]);
  });

  it("fermer l'ANCIENNE connexion n'efface pas la nouvelle", () => {
    // The destroy/rebuild order isn't guaranteed end to end: if the
    // old one's close arrives AFTER the new one is installed, an unconditional clear
    // would leave the folder browser and the model blind, with no error.
    const old = conn(["/a"]);
    setLiveFs(old);
    const fresh = conn(["/a", "/b"]);
    setLiveFs(fresh);

    clearLiveFs(old);

    expect(getLiveFs()).toBe(fresh);
    expect([...getLiveFs()!.roots]).toEqual(["/a", "/b"]);
  });

  it("fermer la connexion COURANTE laisse la capacité absente, jamais périmée", () => {
    const only = conn(["/a"]);
    setLiveFs(only);
    clearLiveFs(only);
    // Absent = "no folder to browse". A stale handle, on the other hand, would lie.
    expect(getLiveFs()).toBeNull();
  });
});
