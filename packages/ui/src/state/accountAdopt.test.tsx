// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { mount } from "../testKit";
import { useChatStore } from "./store";
import { convKeyFor } from "./storePersistence";
import type { AuthUser, Host } from "../host";
import type { Conversation } from "../types";

/**
 * ACCOUNT ADOPTION — the ORDER, not just the result.
 *
 * `state/CLAUDE.md` calls this order « the invariant, not an implementation detail »:
 * `keys.setUser` must be AWAITED before `configured()`, and `db.setUser` before `load()`,
 * otherwise the PREVIOUS account's scope gets read — on a shared machine, A's keys
 * serve B and A's conversations display on B's screen.
 *
 * Until now the invariant only held by prose: `storeSettingsScope.test.ts` tests the
 * PURE key-naming function, and its own `describe` admits it — « documents what
 * store.ts must do ». A test that DOCUMENTS an obligation does not VERIFY it: moving an
 * `await` in `store.ts` left it green.
 *
 * ⚠️ What gives this file its value lives in `yieldTwice`: each `setUser` of the fake
 * host YIELDS THE TURN before resolving. A caller that doesn't await therefore lets
 * `configured`/`load` run first, and the call log shows it. Without this
 * delay, the test would pass even without `await` — it would verify the code's WRITE
 * order, not its EXECUTION order, which is exactly the trap it exists to close.
 *
 * ⚠️ The store ALWAYS adopts `null` first (`getSession()` resolves signed out), then the
 * account. The harness therefore clears its log after this first adoption: without that, an
 * `indexOf("keys.configured")` would catch the signed-out pass's one and the order
 * assertion would no longer be about the account under test.
 */

const USER_A: AuthUser = { id: "uid-a", email: "a@exemple.fr" } as AuthUser;
const USER_B: AuthUser = { id: "uid-b", email: "b@exemple.fr" } as AuthUser;

function conv(id: string, title: string): Conversation {
  return { id, title, messages: [], createdAt: 1, updatedAt: 1 } as unknown as Conversation;
}

function harness() {
  const calls: string[] = [];
  let onChangeCb: ((u: AuthUser | null) => void) | null = null;

  // Two microtask turns: enough to let a caller who does NOT AWAIT time
  // to call the read before the scope is set.
  const yieldTwice = async () => {
    await null;
    await null;
  };

  const host: Partial<Host> = {
    auth: {
      getSession: async () => null, // we start signed out; `signIn` handles the rest
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

/** Mounts the real store, records `loaded` on EVERY render, exposes the snapshot. */
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

  /** Plays an auth event and lets the adoption's async chains unfold. */
  const signIn = async (u: AuthUser | null) => {
    await act(async () => {
      h.fire(u);
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  await signIn(null); // the "signed out" adoption the store always does first
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
    h.calls.length = 0; // we only judge the switch
    await m.signIn(USER_B);

    // The three per-account stores: the database (conversations), the keychain (provider
    // keys), MCP (connector OAuth tokens). Missing one leaves a door
    // open from A to B on a shared machine.
    expect(h.calls).toContain("db.setUser(uid-b)");
    expect(h.calls).toContain("keys.setUser(uid-b)");
    expect(h.calls).toContain("mcp.setUser(uid-b)");
    // The order matters ESPECIALLY here: this is the switch, so the only moment the
    // previous scope really still exists and a premature read genuinely leaks.
    expect(h.calls.indexOf("keys.setUser(uid-b)")).toBeLessThan(h.calls.indexOf("keys.configured"));
    expect(h.calls.indexOf("db.setUser(uid-b)")).toBeLessThan(h.calls.indexOf("db.load"));

    await m.unmount();
  });

  it("une bascule ne laisse RIEN de A à l'écran de B", async () => {
    const h = harness();
    // A has a conversation persisted under ITS key; B has never saved anything.
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
    expect(m.store().loaded).toBe(true); // A's load has completed

    const before = m.loadedHistory().length;
    await m.signIn(USER_B);

    // The switch RESTARTS a load. Without passing through false, B's lists would
    // display as « vides » while they arrive — the bug `loaded` exists to
    // prevent (Coffre/Compétences/Workflows/Mémoire offering « créez-en un »).
    expect(m.loadedHistory().slice(before)).toEqual([false, true]);

    await m.unmount();
  });
});
