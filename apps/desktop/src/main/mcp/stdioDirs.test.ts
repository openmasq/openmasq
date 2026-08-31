import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NOTE: this test lives in `main/mcp/`, not next to its module in `main/mcp/server/` —
// the root `vitest.config.ts` lists `main/mcp/*.test.ts` and NOT the subfolder, so a
// test placed there would never run in CI.

// ⚠️ `vi.mock` paths resolve from THIS file, not from the module under test.
// `persist` and `registry` touch Electron (safeStorage, live connections): we
// replace them with doubles. The rest — `catalog.resolveParams`, the picker gate —
// is the REAL code, since that's precisely what we're verifying.
const store = new Map<string, Record<string, unknown>>();
vi.mock("./persist", () => ({
  getServer: (id: string) => store.get(id),
  addServer: (spec: Record<string, unknown>) => store.set(spec.id as string, spec),
  removeServer: (id: string) => store.delete(id),
  saveSecrets: () => {},
  saveApiKey: () => {},
}));
vi.mock("./server/info", () => ({
  infoFor: (spec: Record<string, unknown>) => ({ id: spec.id, params: spec.params }),
}));
vi.mock("./server/registry", () => ({ mcpDisconnect: () => {} }));

const { mcpSetStdioDirs, notePickedDir } = await import("./server/lifecycle");

const dir = () => mkdtempSync(join(tmpdir(), "openmasq-dirs-"));
const ID = "local-filesystem";
const seed = (roots: string[]) =>
  store.set(ID, { id: ID, name: "Filesystem", kind: "stdio", catalogId: "filesystem", params: { root: roots } });

describe("mcpSetStdioDirs — ajouter/retirer un dossier sans déconnecter", () => {
  let granted: string;
  beforeEach(() => {
    store.clear();
    granted = dir();
    notePickedDir(granted);
    seed([granted]);
  });

  it("REFUSE un dossier que le sélecteur natif n'a pas rendu cette session", async () => {
    // The heart of the gate (audit M-4). Without it, a compromised renderer — or content
    // injected into the model that reached this IPC — would grant itself `/Users/<you>`
    // with a single call, without anyone clicking anything.
    const jamaisChoisi = dir();
    const reconnect = vi.fn();
    const info = await mcpSetStdioDirs(ID, "root", [granted, jamaisChoisi], reconnect);
    expect(info.error).toMatch(/non autorisé/);
    expect(reconnect).not.toHaveBeenCalled();
    // And nothing is persisted: the scope stays what it was before.
    expect(store.get(ID)?.params).toEqual({ root: [granted] });
  });

  it("accepte un dossier choisi via le sélecteur, le persiste, puis RECONSTRUIT la connexion", async () => {
    const second = dir();
    notePickedDir(second);
    const reconnect = vi.fn();
    const info = await mcpSetStdioDirs(ID, "root", [granted, second], reconnect);
    expect(info.error).toBeUndefined();
    expect(store.get(ID)?.params).toEqual({ root: [granted, second] });
    // The live connection must restart on the new scope — otherwise the added
    // folder is only readable on the next launch.
    expect(reconnect).toHaveBeenCalledWith(ID);
  });

  it("ne redemande PAS de re-choisir un dossier déjà accordé quand on en retire un autre", async () => {
    // A removal shouldn't cost a re-selection of all the others: that's what was
    // pushing people to disconnect everything, and so to never adjust the scope.
    const second = dir();
    notePickedDir(second);
    seed([granted, second]);
    const reconnect = vi.fn();
    const info = await mcpSetStdioDirs(ID, "root", [granted], reconnect);
    expect(info.error).toBeUndefined();
    expect(store.get(ID)?.params).toEqual({ root: [granted] });
    expect(reconnect).toHaveBeenCalledWith(ID);
  });

  it("un retrait qui laisserait le champ REQUIS vide est refusé", async () => {
    const info = await mcpSetStdioDirs(ID, "root", [], vi.fn());
    expect(info.error).toMatch(/au moins un dossier/i);
    expect(store.get(ID)?.params).toEqual({ root: [granted] });
  });

  it("refuse un chemin qui n'est pas un dossier existant, même choisi", async () => {
    const fantome = join(tmpdir(), "openmasq-inexistant-42");
    notePickedDir(fantome);
    const info = await mcpSetStdioDirs(ID, "root", [granted, fantome], vi.fn());
    expect(info.error).toBeTruthy();
    expect(store.get(ID)?.params).toEqual({ root: [granted] });
  });

  it("refuse un serveur ou un paramètre inconnu", async () => {
    expect((await mcpSetStdioDirs("local-inconnu", "root", [granted], vi.fn())).error).toBeTruthy();
    expect((await mcpSetStdioDirs(ID, "pas-un-champ", [granted], vi.fn())).error).toBeTruthy();
  });
});
