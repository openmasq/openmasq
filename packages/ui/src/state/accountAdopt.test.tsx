// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { mount } from "../testKit";
import { useChatStore } from "./store";
import { convKeyFor } from "./storePersistence";
import type { AuthUser, Host } from "../host";
import type { Conversation } from "../types";

/**
 * L'ADOPTION D'UN COMPTE — l'ORDRE, pas seulement le résultat.
 *
 * `state/CLAUDE.md` appelle cet ordre « the invariant, not an implementation detail » :
 * `keys.setUser` doit être ATTENDU avant `configured()`, et `db.setUser` avant `load()`,
 * sinon on lit le périmètre du compte PRÉCÉDENT — sur une machine partagée, les clés de A
 * servent à B et les conversations de A s'affichent chez B.
 *
 * Jusqu'ici l'invariante ne tenait que par la prose : `storeSettingsScope.test.ts` teste la
 * fonction PURE de nommage de clé, et son propre `describe` l'admet — « documents what
 * store.ts must do ». Un test qui DOCUMENTE une obligation ne la VÉRIFIE pas : déplacer un
 * `await` dans `store.ts` le laissait vert.
 *
 * ⚠️ Ce qui fait la valeur du fichier tient dans `yieldTwice` : chaque `setUser` du faux
 * hôte CÈDE LE TOUR avant de résoudre. Un appelant qui n'attend pas laisse donc
 * `configured`/`load` s'exécuter en premier, et le journal d'appels le montre. Sans ce
 * délai, le test passerait même sans `await` — il vérifierait l'ordre d'ÉCRITURE du code,
 * pas son ordre d'EXÉCUTION, ce qui est exactement le piège qu'il existe pour fermer.
 *
 * ⚠️ Le store adopte TOUJOURS `null` d'abord (`getSession()` résout déconnecté), puis le
 * compte. Le harnais efface donc son journal après cette première adoption : sans ça, un
 * `indexOf("keys.configured")` attrape celui du passage déconnecté et l'assertion d'ordre
 * ne parle plus du compte qu'on teste.
 */

const USER_A: AuthUser = { id: "uid-a", email: "a@exemple.fr" } as AuthUser;
const USER_B: AuthUser = { id: "uid-b", email: "b@exemple.fr" } as AuthUser;

function conv(id: string, title: string): Conversation {
  return { id, title, messages: [], createdAt: 1, updatedAt: 1 } as unknown as Conversation;
}

function harness() {
  const calls: string[] = [];
  let onChangeCb: ((u: AuthUser | null) => void) | null = null;

  // Deux tours de microtâches : de quoi laisser un appelant qui N'ATTEND PAS le temps
  // d'appeler la lecture avant que le périmètre soit posé.
  const yieldTwice = async () => {
    await null;
    await null;
  };

  const host: Partial<Host> = {
    auth: {
      getSession: async () => null, // on démarre déconnecté ; `signIn` fait la suite
      onChange: (cb) => {
        onChangeCb = cb;
        return () => {
          onChangeCb = null;
        };
      },
    } as Host["auth"],
    keys: {
      setUser: async (uid) => {
        await yieldTwice();
        calls.push(`keys.setUser(${uid})`);
      },
      configured: async () => {
        calls.push("keys.configured");
        return [];
      },
      set: async () => {},
      clear: async () => {},
      importLegacy: async () => {},
    } as Host["keys"],
    db: {
      configured: async () => true,
      setUser: async (uid: string | null) => {
        await yieldTwice();
        calls.push(`db.setUser(${uid})`);
      },
      load: async () => {
        calls.push("db.load");
        return null;
      },
      saveConversation: async () => {},
      deleteConversation: async () => {},
    } as unknown as Host["db"],
    mcp: {
      setUser: async (uid: string | null) => {
        calls.push(`mcp.setUser(${uid})`);
      },
    } as unknown as Host["mcp"],
  };

  return { calls, host, fire: (u: AuthUser | null) => onChangeCb?.(u) };
}

/** Monte le vrai store, enregistre `loaded` à CHAQUE rendu, expose l'instantané. */
function Probe({ sink }: { sink: { api: ReturnType<typeof useChatStore> | null; loaded: boolean[] } }) {
  const api = useChatStore();
  sink.api = api;
  if (sink.loaded[sink.loaded.length - 1] !== api.loaded) sink.loaded.push(api.loaded);
  return null;
}

async function mountStore(h: ReturnType<typeof harness>) {
  const sink: { api: ReturnType<typeof useChatStore> | null; loaded: boolean[] } = {
    api: null,
    loaded: [],
  };
  const m = await mount(<Probe sink={sink} />, { host: h.host });

  /** Joue un événement d'auth et laisse les chaînes async de l'adoption se dérouler. */
  const signIn = async (u: AuthUser | null) => {
    await act(async () => {
      h.fire(u);
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  await signIn(null); // l'adoption « déconnecté » que le store fait toujours en premier
  h.calls.length = 0;

  return { ...m, signIn, store: () => sink.api!, loadedHistory: () => sink.loaded };
}

describe("l'adoption d'un compte — l'ORDRE des await, pas seulement le résultat", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("attend keys.setUser AVANT de lire configured() — sinon B lirait les clés de A", async () => {
    const h = harness();
    const m = await mountStore(h);

    await m.signIn(USER_A);

    expect(h.calls).toContain("keys.setUser(uid-a)");
    expect(h.calls).toContain("keys.configured");
    expect(h.calls.indexOf("keys.setUser(uid-a)")).toBeLessThan(h.calls.indexOf("keys.configured"));

    await m.unmount();
  });

  it("attend db.setUser AVANT load() — sinon on hydrate depuis la base du compte précédent", async () => {
    const h = harness();
    const m = await mountStore(h);

    await m.signIn(USER_A);

    expect(h.calls).toContain("db.setUser(uid-a)");
    expect(h.calls).toContain("db.load");
    expect(h.calls.indexOf("db.setUser(uid-a)")).toBeLessThan(h.calls.indexOf("db.load"));

    await m.unmount();
  });

  it("re-porte les TROIS périmètres sur une bascule, dans le même ordre", async () => {
    const h = harness();
    const m = await mountStore(h);

    await m.signIn(USER_A);
    h.calls.length = 0; // on ne juge que la bascule
    await m.signIn(USER_B);

    // Les trois magasins par compte : la base (conversations), le trousseau (clés de
    // fournisseur), MCP (jetons OAuth des connecteurs). En manquer un laisse une porte
    // ouverte de A vers B sur une machine partagée.
    expect(h.calls).toContain("db.setUser(uid-b)");
    expect(h.calls).toContain("keys.setUser(uid-b)");
    expect(h.calls).toContain("mcp.setUser(uid-b)");
    // L'ordre compte SURTOUT ici : c'est la bascule, donc le seul moment où le périmètre
    // précédent existe vraiment et où une lecture prématurée fuite pour de bon.
    expect(h.calls.indexOf("keys.setUser(uid-b)")).toBeLessThan(h.calls.indexOf("keys.configured"));
    expect(h.calls.indexOf("db.setUser(uid-b)")).toBeLessThan(h.calls.indexOf("db.load"));

    await m.unmount();
  });

  it("une bascule ne laisse RIEN de A à l'écran de B", async () => {
    const h = harness();
    // A a une conversation persistée sous SA clé ; B n'a jamais rien enregistré.
    localStorage.setItem(convKeyFor(USER_A.id)!, JSON.stringify([conv("c-a", "Dossier de A")]));

    const m = await mountStore(h);
    await m.signIn(USER_A);
    expect(m.store().conversations.map((c) => c.id)).toEqual(["c-a"]);

    await m.signIn(USER_B);
    expect(m.store().conversations).toEqual([]);

    await m.unmount();
  });

  it("`loaded` retombe à false pendant la bascule, puis revient — jamais « vide » en silence", async () => {
    const h = harness();
    const m = await mountStore(h);

    await m.signIn(USER_A);
    expect(m.store().loaded).toBe(true); // la charge de A a abouti

    const before = m.loadedHistory().length;
    await m.signIn(USER_B);

    // La bascule REDÉMARRE une charge. Sans le passage par false, les listes de B
    // s'affichent « vides » le temps qu'elles arrivent — le bug que `loaded` existe pour
    // empêcher (Coffre/Compétences/Workflows/Mémoire proposant « créez-en un »).
    expect(m.loadedHistory().slice(before)).toEqual([false, true]);

    await m.unmount();
  });
});
