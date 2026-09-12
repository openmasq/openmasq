import { describe, expect, it } from "vitest";
import { findRunning, joinRunning, sessionName, sessionUrl } from "./attach";

describe("joining a proxy that is already running", () => {
  it("names a session after the tool, so the console column reads like something", () => {
    expect(sessionName("/opt/homebrew/bin/claude")).toMatch(/^claude-[0-9a-f]{4}$/);
    expect(sessionName("claude.cmd")).toMatch(/^claude-[0-9a-f]{4}$/);
    // Two clients never collide on one name — that is the whole point of the suffix.
    expect(sessionName("claude")).not.toBe(sessionName("claude"));
  });

  it("puts the session in the URL, because a tool gives us its base URL and nothing else", () => {
    expect(sessionUrl("http://127.0.0.1:8787", "claude-a3f9")).toBe(
      "http://127.0.0.1:8787/s/claude-a3f9",
    );
  });

  it("joins only something that NAMES itself a proxy", async () => {
    const answer = (body: unknown, ok = true) =>
      (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    expect(
      await findRunning("http://x", answer({ app: "openmasq-proxy", version: "1", ner: true })),
    ).toEqual({ version: "1", model: true });
    // The live-view flag rides along when the build reports it — `openmasq-proxy console`
    // reads it before opening a link — and is simply absent from an older one.
    expect(
      await findRunning(
        "http://x",
        answer({ app: "openmasq-proxy", version: "1", ner: false, console: true }),
      ),
    ).toEqual({ version: "1", model: false, console: true });
    // A 200 from something else on 8787 is not an invitation to hand it an API key.
    expect(await findRunning("http://x", answer({ ok: true, status: "fine" }))).toBeUndefined();
    expect(await findRunning("http://x", answer({ app: "openmasq-proxy" }))).toBeUndefined();
    expect(
      await findRunning("http://x", answer({ app: "openmasq-proxy", version: "1" }, false)),
    ).toBeUndefined();
  });

  /** A joined session masks under the RUNNING proxy's rules, so that is what the opening
   *  sequence is allowed to state. A build that does not report them gets no opening at all
   *  rather than one drawn from the joiner's own flags. */
  it("carries the joined proxy's level, and opens only when it reports it", async () => {
    const answer = (body: unknown) =>
      (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
    const full = { app: "openmasq-proxy", version: "1", ner: true, level: "strict", disabled: [] };
    expect(await findRunning("http://x", answer(full))).toEqual({
      version: "1",
      model: true,
      level: "strict",
      disabled: [],
    });

    const opened: string[] = [];
    const deps = (body: unknown) => ({
      find: () => findRunning("http://x", answer(body)),
      run: async () => 0,
      note: () => {},
      open: async (r: { level?: string }) => void opened.push(r.level ?? "?"),
    });
    await joinRunning("http://x", ["claude"], deps(full));
    expect(opened).toEqual(["strict"]);
    // An older proxy says neither: nothing is claimed on its behalf.
    await joinRunning(
      "http://x",
      ["claude"],
      deps({ app: "openmasq-proxy", version: "0", ner: false }),
    );
    expect(opened).toEqual(["strict"]);
  });

  it("warns that --console/--reveal are ignored when it joins instead of starting", async () => {
    const answer = (body: unknown): typeof fetch =>
      (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    const notes: string[] = [];
    const base = {
      find: () =>
        findRunning("http://x", answer({ app: "openmasq-proxy", version: "1", ner: false })),
      run: async () => 0,
      note: (t: string) => void notes.push(t),
    };
    await joinRunning("http://x", ["codex"], { ...base, startOnly: ["--console", "--reveal"] });
    expect(notes.some((n) => /--console and --reveal ignored/.test(n))).toBe(true);
    // Nothing passed → no warning line.
    notes.length = 0;
    await joinRunning("http://x", ["codex"], { ...base, startOnly: [] });
    expect(notes.some((n) => /ignored/.test(n))).toBe(false);
  });

  it("treats an unreachable port as nothing running", async () => {
    const dead = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await findRunning("http://x", dead)).toBeUndefined();
  });
});
