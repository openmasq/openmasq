// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount, type Mounted } from "../../testKit";
import type { Host } from "../../host";
import { LoginScreen } from "./LoginScreen";

const { captureEvent } = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock("../../analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analytics")>()),
  captureEvent,
}));

const ADDRESS = "personne@exemple.fr";

const hostWith = (sendMagicLink: () => Promise<{ error?: string }>): Partial<Host> => ({
  auth: {
    getSession: async () => null,
    onChange: () => () => {},
    sendMagicLink,
    verifyCode: async () => ({}),
    signOut: async () => {},
  } as unknown as Host["auth"],
});

const sent = () => captureEvent.mock.calls.map(([e]) => e);
const named = (name: string) => sent().filter((e) => e.name === name);

async function submit(m: Mounted) {
  await m.type("input[type=email]", ADDRESS);
  await act(async () => {
    m.find<HTMLFormElement>("form").requestSubmit();
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  captureEvent.mockClear();
  localStorage.clear();
});

describe("LoginScreen — la télémétrie de l'écran d'avant l'onboarding", () => {
  it("compte l'écran affiché, puis l'envoi réussi et l'écran suivant", async () => {
    const m = await mount(<LoginScreen />, { host: hostWith(async () => ({})) });
    expect(named("login_step")).toEqual([{ name: "login_step", step: "email" }]);
    await submit(m);
    expect(named("login_result")).toEqual([{ name: "login_result", method: "link", outcome: "ok" }]);
    expect(named("login_step").map((e) => e.step)).toEqual(["email", "code"]);
    await m.unmount();
  });

  it("nomme un refus d'inscription, sans changer d'écran", async () => {
    const m = await mount(<LoginScreen />, {
      host: hostWith(async () => ({ error: "Signups not allowed for this instance" })),
    });
    await submit(m);
    expect(named("login_result")).toEqual([
      { name: "login_result", method: "link", outcome: "signups_closed" },
    ]);
    expect(named("login_step").map((e) => e.step)).toEqual(["email"]);
    await m.unmount();
  });

  it("ne laisse JAMAIS passer l'adresse ni le texte du serveur", async () => {
    const m = await mount(<LoginScreen />, {
      host: hostWith(async () => ({ error: `Unknown failure for ${ADDRESS}` })),
    });
    await submit(m);
    expect(named("login_result")).toEqual([{ name: "login_result", method: "link", outcome: "other" }]);
    expect(JSON.stringify(sent())).not.toContain(ADDRESS);
    expect(JSON.stringify(sent())).not.toContain("Unknown failure");
    await m.unmount();
  });

  it("compte aussi le renvoi du lien", async () => {
    const m = await mount(<LoginScreen />, { host: hostWith(async () => ({})) });
    await submit(m);
    captureEvent.mockClear();
    await act(async () => {
      m.findAll<HTMLButtonElement>(".login-code-row button").at(-1)!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(named("login_result")).toEqual([{ name: "login_result", method: "link", outcome: "ok" }]);
    await m.unmount();
  });
});
