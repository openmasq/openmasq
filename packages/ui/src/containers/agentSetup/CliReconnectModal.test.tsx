// @vitest-environment jsdom
// « Se reconnecter » runs the CLI's OWN sign-in at once — even when its status still reads
// « connected » (a token the API refused) — and reports success only for THAT sign-in.
import { act } from "react";
import type { SubscriptionCliStatus } from "@openmasq/llm";
import { describe, expect, it, vi } from "vitest";
import type { Host } from "../../host";
import { mount } from "../../testKit";
import { CliReconnectModal } from "./CliReconnectModal";

const status = (loggedIn: boolean | null): SubscriptionCliStatus => ({
  cli: "claude",
  installed: true,
  installable: true,
  connectable: true,
  loggedIn,
  ...(loggedIn ? { email: "a@b.c" } : {}),
});
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("CliReconnectModal", () => {
  it("starts the sign-in at once, and signals only once it succeeded", async () => {
    let finish: (r: { ok: boolean }) => void = () => {};
    const login = vi.fn(() => new Promise<{ ok: boolean }>((r) => (finish = r)));
    const onSignedIn = vi.fn();
    const host: Partial<Host> = {
      readSubscriptionStatus: async () => status(true), // stale: the API refused the token
      installSubscriptionCli: async () => ({ ok: true }),
      loginSubscriptionCli: login,
      submitSubscriptionLoginCode: async () => true,
      cancelSubscriptionLogin: async () => {},
      onSubscriptionInstallProgress: () => () => {},
      onSubscriptionLoginEvent: () => () => {},
    };
    const ui = await mount(<CliReconnectModal cli="claude" label="Claude Code" onSignedIn={onSignedIn} onClose={() => {}} />, {
      host,
    });
    await flush();
    expect(login).toHaveBeenCalledWith("claude");
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(ui.el.ownerDocument.body.textContent).toContain("Reconnecter Claude Code");
    await act(async () => finish({ ok: true }));
    await flush();
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    await ui.unmount();
  });

  it("closing mid-sign-in cancels the CLI's waiting sign-in", async () => {
    const cancel = vi.fn(async () => {});
    const host: Partial<Host> = {
      readSubscriptionStatus: async () => status(false),
      installSubscriptionCli: async () => ({ ok: true }),
      loginSubscriptionCli: () => new Promise(() => {}),
      submitSubscriptionLoginCode: async () => true,
      cancelSubscriptionLogin: cancel,
      onSubscriptionInstallProgress: () => () => {},
      onSubscriptionLoginEvent: () => () => {},
    };
    const ui = await mount(<CliReconnectModal cli="claude" label="Claude Code" onSignedIn={() => {}} onClose={() => {}} />, {
      host,
    });
    await flush();
    await ui.unmount();
    expect(cancel).toHaveBeenCalledWith("claude");
  });
});
