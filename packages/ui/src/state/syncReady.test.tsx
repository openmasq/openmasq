// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { mount } from "../testKit";
import { useChatStore } from "./store";
import type { AuthUser, Host } from "../host";

/**
 * THE INCIDENT OF 14/08: the sync channels used to start on `store.loaded`, which is true
 * even when `db.load()` has FAILED. A pull run against this un-hydrated store finds no
 * conversations (`getExisting` → undefined), fabricates SKELETONS from the server's
 * convMeta, and the mirror persists them — 47 conversations emptied of their messages, their
 * vault and their files. The push, meanwhile, would have tombstoned « tout supprimé ».
 *
 * The pinned invariant: `loaded` (the UI can live) and `syncReady` (sync can run)
 * are two different things — and a DB load failure opens the first WITHOUT opening the
 * second. Against the real `useChatStore`, stubbed host.
 */

const USER: AuthUser = { id: "uid-sync", email: "s@exemple.fr" } as AuthUser;

function harness(db: Partial<Host>["db"] | undefined) {
  let onChangeCb: ((u: AuthUser | null) => void) | null = null;
  const host: Partial<Host> = {
    auth: {
      getSession: async () => null,
      onChange: (cb) => {
        onChangeCb = cb;
        return () => {
          onChangeCb = null;
        };
      },
    } as Host["auth"],
    keys: {
      setUser: async () => {},
      configured: async () => [],
      set: async () => {},
      clear: async () => {},
      importLegacy: async () => {},
    } as Host["keys"],
    ...(db ? { db: db as Host["db"] } : {}),
  };
  return { host, fire: (u: AuthUser | null) => onChangeCb?.(u) };
}

function Probe({ sink }: { sink: { api: ReturnType<typeof useChatStore> | null } }) {
  sink.api = useChatStore();
  return null;
}

async function mountStore(h: ReturnType<typeof harness>) {
  const sink: { api: ReturnType<typeof useChatStore> | null } = { api: null };
  await mount(<Probe sink={sink} />, { host: h.host });
  const signIn = async (u: AuthUser | null) => {
    await act(async () => {
      h.fire(u);
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  await signIn(null);
  await signIn(USER);
  return { store: () => sink.api! };
}

beforeEach(() => localStorage.clear());

describe("syncReady — un chargement DB en échec n'ouvre JAMAIS la sync", () => {
  it("db.load() qui ÉCHOUE : loaded vrai (l'UI vit), syncReady FAUX (la sync reste fermée)", async () => {
    const m = await mountStore(
      harness({
        configured: async () => true,
        setUser: async () => {},
        load: async () => {
          throw new Error("base verrouillée");
        },
        saveConversation: async () => {},
        deleteConversation: async () => {},
      } as unknown as Host["db"]),
    );
    expect(m.store().loaded).toBe(true);
    expect(m.store().syncReady).toBe(false);
  });

  it("db.load() qui RÉUSSIT (même vide) : les deux portes s'ouvrent", async () => {
    const m = await mountStore(
      harness({
        configured: async () => true,
        setUser: async () => {},
        load: async () => ({ conversations: [] }) as never,
        saveConversation: async () => {},
        deleteConversation: async () => {},
      } as unknown as Host["db"]),
    );
    expect(m.store().loaded).toBe(true);
    expect(m.store().syncReady).toBe(true);
  });

  it("sans DB (aperçu navigateur, mobile) : l'état localStorage EST l'hydratation", async () => {
    const m = await mountStore(harness(undefined));
    expect(m.store().loaded).toBe(true);
    expect(m.store().syncReady).toBe(true);
  });
});
