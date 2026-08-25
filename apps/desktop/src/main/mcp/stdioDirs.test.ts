import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NOTE: ce test vit dans `main/mcp/`, pas à côté de son module dans `main/mcp/server/` —
// le `vitest.config.ts` racine liste `main/mcp/*.test.ts` et PAS le sous-dossier, donc un
// test placé là ne tournerait jamais en CI.

// ⚠️ Les chemins de `vi.mock` se résolvent depuis CE fichier, pas depuis le module testé.
// `persist` et `registry` touchent Electron (safeStorage, connexions vivantes) : on les
// remplace par des doubles. Le reste — `catalog.resolveParams`, la porte du sélecteur —
// est le VRAI code, puisque c'est précisément ce qu'on vérifie.
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
    // Le cœur de la porte (audit M-4). Sans elle, un renderer compromis — ou du contenu
    // injecté dans le modèle qui atteindrait cette IPC — s'accorderait `/Users/<vous>`
    // par un simple appel, sans que personne ne clique quoi que ce soit.
    const jamaisChoisi = dir();
    const reconnect = vi.fn();
    const info = await mcpSetStdioDirs(ID, "root", [granted, jamaisChoisi], reconnect);
    expect(info.error).toMatch(/non autorisé/);
    expect(reconnect).not.toHaveBeenCalled();
    // Et rien n'est persisté : le périmètre reste celui d'avant.
    expect(store.get(ID)?.params).toEqual({ root: [granted] });
  });

  it("accepte un dossier choisi via le sélecteur, le persiste, puis RECONSTRUIT la connexion", async () => {
    const second = dir();
    notePickedDir(second);
    const reconnect = vi.fn();
    const info = await mcpSetStdioDirs(ID, "root", [granted, second], reconnect);
    expect(info.error).toBeUndefined();
    expect(store.get(ID)?.params).toEqual({ root: [granted, second] });
    // La connexion vivante doit repartir sur le nouveau périmètre — sinon le dossier
    // ajouté n'est lisible qu'au prochain lancement.
    expect(reconnect).toHaveBeenCalledWith(ID);
  });

  it("ne redemande PAS de re-choisir un dossier déjà accordé quand on en retire un autre", async () => {
    // Un retrait ne doit pas coûter une re-sélection de tous les autres : c'est ce qui
    // poussait à tout déconnecter, donc à ne jamais ajuster le périmètre.
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
