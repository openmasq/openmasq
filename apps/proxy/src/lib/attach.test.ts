import { describe, expect, it } from "vitest";
import { findRunning, sessionName, sessionUrl } from "./attach";

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
    // A 200 from something else on 8787 is not an invitation to hand it an API key.
    expect(await findRunning("http://x", answer({ ok: true, status: "fine" }))).toBeUndefined();
    expect(await findRunning("http://x", answer({ app: "openmasq-proxy" }))).toBeUndefined();
    expect(
      await findRunning("http://x", answer({ app: "openmasq-proxy", version: "1" }, false)),
    ).toBeUndefined();
  });

  it("treats an unreachable port as nothing running", async () => {
    const dead = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await findRunning("http://x", dead)).toBeUndefined();
  });
});
