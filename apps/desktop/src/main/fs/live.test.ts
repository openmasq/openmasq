import { describe, it, expect, beforeEach, vi } from "vitest";

// `LocalFsConnection` forks a utilityProcess and `mainOps` needs `shell`; neither is
// exercised here — we only ever look at the roots a connection carries.
vi.mock("electron", () => ({
  utilityProcess: { fork: () => ({ on: () => {}, postMessage: () => {}, kill: () => {} }) },
  shell: { trashItem: async () => {}, openPath: async () => "" },
  // `on` : `runtime/quitState.ts` (importé par fs/connection) enregistre `before-quit`
  // au chargement du module — le mock doit l'accepter comme le vrai `app`.
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

    // Ce que fait `mcp:set-dirs` : on détruit, puis on refait avec le nouveau périmètre.
    setLiveFs(conn(["/a", "/b"]));
    expect([...getLiveFs()!.roots]).toEqual(["/a", "/b"]);
  });

  it("fermer l'ANCIENNE connexion n'efface pas la nouvelle", () => {
    // L'ordre destruction/reconstruction n'est pas garanti d'un bout à l'autre : si la
    // fermeture de l'ancienne arrive APRÈS l'installation de la nouvelle, effacer sans
    // condition rendrait le navigateur de dossiers et le modèle aveugles, sans erreur.
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
    // Absent = « pas de dossier à parcourir ». Une poignée périmée, elle, mentirait.
    expect(getLiveFs()).toBeNull();
  });
});
