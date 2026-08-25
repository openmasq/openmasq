// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { mount } from "../testKit";
import { useChatStore } from "./store";
import type { AuthUser, Host } from "../host";

/**
 * LE SINISTRE DU 14/08 : les canaux de sync démarraient sur `store.loaded`, qui est vrai
 * même quand `db.load()` a ÉCHOUÉ. Un pull tiré sur ce store pas hydraté ne trouve pas les
 * conversations (`getExisting` → undefined), fabrique des SQUELETTES depuis les convMeta
 * du serveur, et le miroir les persiste — 47 conversations vidées de leurs messages, du
 * coffre et des fichiers. Le push, lui, aurait tombstoné « tout supprimé ».
 *
 * L'invariant épinglé : `loaded` (l'UI peut vivre) et `syncReady` (la sync peut tourner)
 * sont deux choses — et un échec de chargement DB ouvre la première SANS ouvrir la
 * seconde. Contre le vrai `useChatStore`, hôte bouchonné.
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
