// @vitest-environment jsdom
// The sign-in state of a subscription CLI, as availability reads it: only a KNOWN
// signed-out CLI blocks; unknown never does; a sign-in re-opens it at once, no spawn.
import { act } from "react";
import { cliAuthWire, type SubscriptionCliStatus, type SubscriptionLoginEvent } from "@openmasq/llm";
import { describe, expect, it, vi } from "vitest";
import { useHost, type Host } from "../../host";
import { mount } from "../../testKit";
import { modelUnavailableReason, type CliReadiness } from "../../send/modelAvailability";
import { noteCliAuthFailure, noteCliSession } from "./cliSession";
import { useClaudeCliProbe } from "./useAvailabilityProbes";

const status = (loggedIn: boolean | null): SubscriptionCliStatus => ({
  cli: "claude",
  installed: true,
  installable: true,
  connectable: true,
  loggedIn,
});

const seen: { ref: { readonly current: CliReadiness } | null } = { ref: null };
function Probe({ enabled = true }: { enabled?: boolean }) {
  const { claudeCliReady, claudeCliReadyRef } = useClaudeCliProbe(useHost(), enabled);
  seen.ref = claudeCliReadyRef;
  return <span>{String(claudeCliReady)}</span>;
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

function hostWith(read: () => Promise<SubscriptionCliStatus | null>) {
  let emit: ((e: SubscriptionLoginEvent) => void) | null = null;
  const host: Partial<Host> = {
    probeClaudeCli: async () => true,
    readSubscriptionStatus: vi.fn(read),
    onSubscriptionLoginEvent: (cb) => {
      emit = cb;
      return () => {
        emit = null;
      };
    },
  };
  return { host, emit: (e: SubscriptionLoginEvent) => act(async () => emit?.(e)) };
}

describe("CLI session → availability", () => {
  it("loggedIn false ⇒ signed_out: greyed with its reason, the send refused", async () => {
    const { host } = hostWith(async () => status(false));
    const ui = await mount(<Probe />, { host });
    await flush();
    expect(ui.el.textContent).toBe("signed_out");
    expect(modelUnavailableReason({ ...BASE, claudeCliReady: "signed_out" })).toBe("cli_signed_out");
    await ui.unmount();
  });

  it("loggedIn null (unknown) never blocks", async () => {
    const { host } = hostWith(async () => status(null));
    const ui = await mount(<Probe />, { host });
    await flush();
    expect(ui.el.textContent).toBe("true");
    await ui.unmount();
  });

  it("a status that throws is unknown too — never a block", async () => {
    const { host } = hostWith(async () => {
      throw new Error("spawn failed");
    });
    const ui = await mount(<Probe />, { host });
    await flush();
    expect(ui.el.textContent).toBe("true");
    await ui.unmount();
  });

  it("loggedIn true opens it", async () => {
    const { host } = hostWith(async () => status(true));
    const ui = await mount(<Probe />, { host });
    await flush();
    expect(ui.el.textContent).toBe("true");
    await ui.unmount();
  });

  it("the opt-in off: the status is never asked (no spawn), the model stays closed", async () => {
    const { host } = hostWith(async () => status(false));
    const ui = await mount(<Probe enabled={false} />, { host });
    await flush();
    expect(host.readSubscriptionStatus).not.toHaveBeenCalled();
    expect(ui.el.textContent).toBe("false");
    await ui.unmount();
  });

  it("a successful sign-in re-opens it at once, with no new status spawn", async () => {
    const { host, emit } = hostWith(async () => status(false));
    const ui = await mount(<Probe />, { host });
    await flush();
    expect(ui.el.textContent).toBe("signed_out");
    await emit({ cli: "codex", kind: "done", ok: true });
    expect(ui.el.textContent).toBe("signed_out");
    await emit({ cli: "claude", kind: "done", ok: false, error: "login" });
    expect(ui.el.textContent).toBe("signed_out");
    await emit({ cli: "claude", kind: "done", ok: true });
    expect(ui.el.textContent).toBe("true");
    expect(host.readSubscriptionStatus).toHaveBeenCalledTimes(1);
    await ui.unmount();
  });

  it("a note reaches the send gate's ref in the SAME tick, before any re-render", async () => {
    const { host } = hostWith(async () => status(false));
    const ui = await mount(<Probe />, { host });
    await flush();
    expect(seen.ref?.current).toBe("signed_out");
    // Inside act, React defers the re-render to its end: the ref must not wait for it.
    await act(async () => {
      noteCliSession("claude", true);
      expect(seen.ref?.current).toBe(true);
      expect(ui.el.textContent).toBe("signed_out");
    });
    await ui.unmount();
  });

  it("a turn refused for its session closes the model until a sign-in", async () => {
    const { host } = hostWith(async () => status(true));
    const ui = await mount(<Probe />, { host });
    await flush();
    await act(async () => noteCliAuthFailure(cliAuthWire("claude", "OAuth token has expired")));
    expect(ui.el.textContent).toBe("signed_out");
    await act(async () => noteCliAuthFailure("API Error: 529 overloaded"));
    expect(ui.el.textContent).toBe("signed_out");
    await act(async () => noteCliAuthFailure(cliAuthWire("codex")));
    expect(ui.el.textContent).toBe("signed_out");
    await ui.unmount();
  });

  it("focus re-reads the status at most once a minute (it spawns the CLI)", async () => {
    const { host } = hostWith(async () => status(true));
    const ui = await mount(<Probe />, { host });
    await flush();
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("focus"));
    await flush();
    expect(host.readSubscriptionStatus).toHaveBeenCalledTimes(1);
    await ui.unmount();
  });
});

const BASE = {
  model: { id: "claude-cli", provider: "claude-cli" as const },
  effectivePlatform: false,
  orgProfile: null,
  personalCredits: null,
  keyConfigured: new Set<string>(),
  openaiCompatBaseUrl: "",
};
