// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { useChatStore } from "../store";
import { SETTINGS_KEY, settingsKeyFor } from "../storePersistence";
import type { AuthUser, Host } from "../../host";

const { consent } = vi.hoisted(() => ({ consent: [] as Array<boolean | "wait"> }));
vi.mock("../../analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analytics")>()),
  setAnalyticsConsent: (on: boolean) => consent.push(on),
  awaitAnalyticsConsent: () => consent.push("wait"),
}));

/**
 * A consent choice lives in the ACCOUNT's settings, and the store starts on the UNSCOPED
 * blob, which never holds it. The decision must therefore wait for the account: a `true`
 * taken from the unscoped blob releases the sink's queue, and what is released has left.
 */
const USER = { id: "uid-a", email: "a@exemple.fr" } as AuthUser;

function hostFor(opts: { session: AuthUser | null; dbSettings?: object }) {
  let fire: ((u: AuthUser | null) => void) | null = null;
  const host: Partial<Host> = {
    auth: {
      getSession: async () => opts.session,
      onChange: (cb: (u: AuthUser | null) => void) => {
        fire = cb;
        return () => {};
      },
    } as unknown as Host["auth"],
    db: {
      configured: async () => true,
      setUser: async () => {},
      load: async () => ({ conversations: [], settings: opts.dbSettings ?? null }),
      saveConversation: async () => {},
      deleteConversation: async () => {},
    } as unknown as Host["db"],
  };
  return { host, signIn: (u: AuthUser) => fire?.(u) };
}

const Probe = () => {
  useChatStore();
  return null;
};
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

beforeEach(() => {
  localStorage.clear();
  consent.length = 0;
});

describe("le consentement attend les réglages du compte", () => {
  it("un compte qui a refusé ne libère JAMAIS la file au lancement", async () => {
    localStorage.setItem(settingsKeyFor(USER.id), JSON.stringify({ analyticsConsent: false }));
    const m = await mount(<Probe />, { host: hostFor({ session: USER }).host });
    await settle();
    expect(consent).not.toContain(true);
    expect(consent.at(-1)).toBe(false);
    await m.unmount();
  });

  it("un refus connu de la seule base locale ne la libère pas non plus", async () => {
    const h = hostFor({ session: USER, dbSettings: { analyticsConsent: false } });
    const m = await mount(<Probe />, { host: h.host });
    await settle();
    expect(consent).not.toContain(true);
    expect(consent.at(-1)).toBe(false);
    await m.unmount();
  });

  it("sans choix exprimé, la décision par défaut tombe une fois le compte chargé", async () => {
    const m = await mount(<Probe />, { host: hostFor({ session: USER }).host });
    await settle();
    expect(consent[0]).toBe("wait");
    expect(consent.at(-1)).toBe(true);
    await m.unmount();
  });

  it("une connexion reprend la décision le temps de lire le compte qui arrive", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({}));
    localStorage.setItem(settingsKeyFor(USER.id), JSON.stringify({ analyticsConsent: false }));
    const h = hostFor({ session: null });
    const m = await mount(<Probe />, { host: h.host });
    await settle();
    expect(consent.at(-1)).toBe(true);
    consent.length = 0;
    await act(async () => {
      h.signIn(USER);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(consent[0]).toBe("wait");
    expect(consent).not.toContain(true);
    expect(consent.at(-1)).toBe(false);
    await m.unmount();
  });
});
