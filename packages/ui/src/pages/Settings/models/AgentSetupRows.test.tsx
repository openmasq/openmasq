// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Host } from "../../../host";
import { mount } from "../../../testKit";
import { AgentSetupRows } from "./AgentSetupRows";

/**
 * The rows that take a CLI from « absent » to « connected » without a terminal. What
 * these cases protect: each state shows ONE gesture and names what it does (the
 * download is announced with its size before the click); the sign-in relays what the
 * CLI printed — claude gets a field to paste, codex a code to type — and a host without
 * the set-up slots draws nothing at all rather than a button that does nothing.
 */
const status = (over: Partial<NonNullable<Awaited<ReturnType<NonNullable<Host["readSubscriptionStatus"]>>>>>) => ({
  cli: "claude" as const,
  installed: false,
  installable: true,
  connectable: true,
  downloadBytes: 199_000_000,
  loggedIn: null,
  ...over,
});

const hostWith = (over: Partial<Host>): Partial<Host> => ({
  readSubscriptionStatus: async () => status({}),
  installSubscriptionCli: async () => ({ ok: true }),
  loginSubscriptionCli: () => new Promise(() => {}),
  submitSubscriptionLoginCode: async () => true,
  cancelSubscriptionLogin: async () => {},
  onSubscriptionInstallProgress: () => () => {},
  onSubscriptionLoginEvent: () => () => {},
  ...over,
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("AgentSetupRows", () => {
  it("draws nothing on a host without the set-up slots", async () => {
    const ui = await mount(<AgentSetupRows cli="claude" label="Claude Code" />, { host: {} });
    expect(ui.maybe(".agent-setup-row")).toBeNull();
  });

  it("absent: says what the click downloads, and the click installs", async () => {
    const install = vi.fn(async () => ({ ok: true }));
    const ui = await mount(<AgentSetupRows cli="claude" label="Claude Code" />, {
      host: hostWith({ installSubscriptionCli: install }),
    });
    await tick();
    expect(ui.find(".agent-setup-row").textContent).toContain("Claude Code");
    expect(ui.find(".agent-setup-row").textContent).toContain("199");
    await ui.click("button");
    expect(install).toHaveBeenCalledWith("claude");
  });

  it("installed but not signed in: one button, the CLI's own sign-in", async () => {
    const login = vi.fn(() => new Promise<{ ok: boolean }>(() => {}));
    const ui = await mount(<AgentSetupRows cli="claude" label="Claude Code" />, {
      host: hostWith({
        readSubscriptionStatus: async () => status({ installed: true, loggedIn: false }),
        loginSubscriptionCli: login,
      }),
    });
    await tick();
    await ui.click("button");
    expect(login).toHaveBeenCalledWith("claude");
    // claude: the page shows a code to paste back — the field appears while it waits.
    await ui.rerender(<AgentSetupRows cli="claude" label="Claude Code" />);
    expect(ui.maybe("input#agent-setup-code")).not.toBeNull();
  });

  it("connected: the account's e-mail and plan, no button", async () => {
    const ui = await mount(<AgentSetupRows cli="codex" label="GPT Codex" />, {
      host: hostWith({
        readSubscriptionStatus: async () => status({ cli: "codex", installed: true, loggedIn: true, email: "a@b.c", plan: "max" }),
      }),
    });
    await tick();
    expect(ui.find(".agent-setup-row").textContent).toContain("a@b.c");
    expect(ui.maybe("button")).toBeNull();
  });

  it("installed, no sign-in the app can run (antigravity): one line, no button", async () => {
    // `agy` has no auth command: a « Se connecter » here could only answer « unsupported ».
    const ui = await mount(<AgentSetupRows cli="antigravity" label="Antigravity" />, {
      host: hostWith({
        readSubscriptionStatus: async () =>
          status({ cli: "antigravity", installed: true, installable: false, connectable: false, loggedIn: null }),
      }),
    });
    await tick();
    expect(ui.find(".agent-setup-row").textContent).toMatch(/outil lui-même|tool itself/);
    expect(ui.maybe("button")).toBeNull();
  });

  it("a failed install says why, from the catalogue, and offers the button again", async () => {
    const ui = await mount(<AgentSetupRows cli="claude" label="Claude Code" />, {
      host: hostWith({ installSubscriptionCli: async () => ({ ok: false, error: "checksum" as const }) }),
    });
    await tick();
    await ui.click("button");
    await tick();
    expect(ui.find(".agent-setup-error").textContent).toMatch(/empreinte|fingerprint/);
    expect(ui.maybe("button")).not.toBeNull();
  });
});
