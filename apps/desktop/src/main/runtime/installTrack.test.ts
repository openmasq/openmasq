import { beforeEach, describe, expect, it } from "vitest";
import type { TrackEvent } from "@openmasq/ui";
import {
  resetInstallTracking,
  trackCliInstall,
  trackCliLogin,
  trackCliStatus,
  trackLoginWithoutCli,
  trackPythonRuntime,
} from "./installTrack";

// A clock that advances 1s per read: durations are then exact and readable.
const clock = () => {
  let t = 0;
  return () => (t += 1000);
};
const sink = () => {
  const events: TrackEvent[] = [];
  return { events, emit: (e: TrackEvent) => events.push(e) };
};

beforeEach(() => resetInstallTracking());

describe("trackCliInstall", () => {
  it("a start, then the result with the last phase reached", async () => {
    const { events, emit } = sink();
    const r = await trackCliInstall(
      "codex",
      emit,
      async (on) => {
        on({ cli: "codex", phase: "download", received: 0, total: 10 });
        on({ cli: "codex", phase: "install" });
        on({ cli: "codex", phase: "done" });
        return { ok: true };
      },
      clock(),
    );
    expect(r).toEqual({ ok: true });
    expect(events).toEqual([
      { name: "cli_install_start", cli: "codex" },
      { name: "cli_install", cli: "codex", outcome: "ok", stage: "done", duration: 1000 },
    ]);
  });

  it("a failure says WHERE it stopped", async () => {
    const { events, emit } = sink();
    await trackCliInstall("claude", emit, async (on) => {
      on({ cli: "claude", phase: "download", received: 0, total: 10 });
      return { ok: false, error: "network" };
    });
    expect(events.at(-1)).toMatchObject({ name: "cli_install", outcome: "network", stage: "download" });
  });

  it("a refusal before any phase still reports start + result", async () => {
    const { events, emit } = sink();
    await trackCliInstall("antigravity", emit, async () => ({ ok: false, error: "unsupported" }));
    expect(events.map((e) => e.name)).toEqual(["cli_install_start", "cli_install"]);
    expect(events[1]).toMatchObject({ outcome: "unsupported", stage: "start" });
  });

  it("`busy` (a second click on a running install) reports nothing", async () => {
    const { events, emit } = sink();
    await trackCliInstall("codex", emit, async () => ({ ok: false, error: "busy" }));
    expect(events).toEqual([]);
  });

  it("a throwing reporter never changes the install's result", async () => {
    const r = await trackCliInstall(
      "codex",
      () => {
        throw new Error("bridge down");
      },
      async () => ({ ok: true }),
    );
    expect(r).toEqual({ ok: true });
  });
});

describe("trackCliLogin", () => {
  it("relays HOW the sign-in ended, with its duration", async () => {
    const { events, emit } = sink();
    await trackCliLogin(
      "codex",
      emit,
      (onEnd) => {
        onEnd({ outcome: "timeout", urlShown: true });
        return Promise.resolve({ ok: false, error: "login" });
      },
      clock(),
    );
    expect(events).toEqual([
      { name: "cli_login_start", cli: "codex" },
      { name: "cli_login", cli: "codex", outcome: "timeout", url_shown: true, duration: 1000 },
    ]);
  });

  it("a CLI with no sign-in: `unsupported`, and the caller gets null", async () => {
    const { events, emit } = sink();
    expect(await trackCliLogin("antigravity", emit, () => null)).toBeNull();
    expect(events.at(-1)).toMatchObject({ outcome: "unsupported" });
  });

  it("a sign-in asked with no CLI on the machine: `no_cli`", () => {
    const { events, emit } = sink();
    trackLoginWithoutCli("codex", emit);
    expect(events.at(-1)).toMatchObject({ name: "cli_login", outcome: "no_cli", url_shown: false });
  });
});

describe("trackCliStatus", () => {
  const base = { cli: "codex" as const, installable: true, connectable: true };

  it("once per distinct answer, never the account's email", () => {
    const { events, emit } = sink();
    trackCliStatus({ ...base, installed: true, loggedIn: false }, emit);
    trackCliStatus({ ...base, installed: true, loggedIn: false }, emit);
    trackCliStatus({ ...base, installed: true, loggedIn: true, email: "a@b.c", plan: "plus" }, emit);
    expect(events).toEqual([
      { name: "cli_status", cli: "codex", installed: true, logged_in: "no" },
      { name: "cli_status", cli: "codex", installed: true, logged_in: "yes" },
    ]);
  });

  it("`null` (the CLI did not answer) is `unknown`, never `no`", () => {
    const { events, emit } = sink();
    trackCliStatus({ ...base, installed: false, loggedIn: null }, emit);
    trackCliStatus(null, emit);
    expect(events).toEqual([{ name: "cli_status", cli: "codex", installed: false, logged_in: "unknown" }]);
  });
});

describe("trackPythonRuntime", () => {
  it("names the source from the phases it saw, and reports the first success only", async () => {
    const { events, emit } = sink();
    const seen: string[] = [];
    await trackPythonRuntime(
      emit,
      async (on) => {
        on({ phase: "download", pct: 50 });
        on({ phase: "extract" });
        on({ phase: "install" });
        on({ phase: "ready" });
        return { pythonBin: "x" };
      },
      (p) => seen.push(p.phase),
      clock(),
    );
    await trackPythonRuntime(emit, async () => ({ pythonBin: "x" }));
    expect(seen).toEqual(["download", "extract", "install", "ready"]);
    expect(events).toEqual([
      { name: "python_runtime", source: "downloaded", outcome: "ok", stage: "ready", duration: 1000 },
    ]);
  });

  it("the bundled runtime only says `ready`", async () => {
    const { events, emit } = sink();
    await trackPythonRuntime(emit, async (on) => (on({ phase: "ready" }), 1));
    expect(events[0]).toMatchObject({ source: "bundled", outcome: "ok" });
  });

  it("a failure is reported at its stage, once per stage, and still throws", async () => {
    const { events, emit } = sink();
    const failing = async (on: (p: { phase: "download" }) => void) => {
      on({ phase: "download" });
      throw new Error("offline");
    };
    await expect(trackPythonRuntime(emit, failing)).rejects.toThrow("offline");
    await expect(trackPythonRuntime(emit, failing)).rejects.toThrow("offline");
    expect(events).toEqual([
      expect.objectContaining({ name: "python_runtime", source: "downloaded", outcome: "error", stage: "download" }),
    ]);
  });
});
