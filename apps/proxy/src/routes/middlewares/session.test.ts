import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../../config/config";
import type { Locals } from "../../lib/relay";
import { sessionMiddleware } from "./session";

/** Run the middleware as a request would, and hand back what it put on `res.locals`. */
const run = (
  mw: ReturnType<typeof sessionMiddleware>,
  req: { params?: Record<string, string>; headers?: Record<string, string> },
): Locals => {
  const locals = {} as Locals;
  mw(
    { params: req.params ?? {}, headers: req.headers ?? {} } as never,
    { locals } as never,
    () => {},
  );
  return locals;
};

describe("one agent, one vault", () => {
  /**
   * THE invariant the two channels rest on. A wrapped tool's model calls arrive under its own
   * `/s/<session>` prefix — that is the whole base URL it was handed — while its tool calls
   * arrive at `/mcp`, which names no session at all. If those resolve to two different vaults,
   * a value masked in a tool RESULT gets a fake the model then echoes, and the reply is
   * restored against a vault that never minted it: the user reads the fake.
   */
  it("gives the wrapped client's /s/<session> and the unnamed /mcp the SAME vault", () => {
    const config = { ...DEFAULTS, mcp: true };
    const mw = sessionMiddleware(config, "claude-Xk9pQ2mnLw3z");

    const model = run(mw, { params: { sid: "claude-Xk9pQ2mnLw3z" } }); // /s/<session>/v1/messages
    const tools = run(mw, {}); // /mcp — names nothing

    model.vault["Lubin Mabille"] = "Jean Dupont";
    expect(tools.vault).toBe(model.vault);
    expect(tools.vault["Lubin Mabille"]).toBe("Jean Dupont");
    expect(tools.key).toBe(model.key);
  });

  it("still keeps a SECOND client's session apart — that is what the prefix is for", () => {
    const mw = sessionMiddleware({ ...DEFAULTS, mcp: true }, "claude-Xk9pQ2mnLw3z");
    const mine = run(mw, { params: { sid: "claude-Xk9pQ2mnLw3z" } });
    const other = run(mw, { params: { sid: "codex-Zm3nQ8pLk2wa" } });
    expect(other.vault).not.toBe(mine.vault);
    expect(other.key).not.toBe(mine.key);
  });

  it("falls back to one shared process vault when no client was wrapped", () => {
    const mw = sessionMiddleware({ ...DEFAULTS, mcp: true });
    expect(run(mw, {}).vault).toBe(run(mw, {}).vault);
  });

  it("without --mcp an unnamed caller still gets a vault of its own", () => {
    const mw = sessionMiddleware({ ...DEFAULTS, mcp: false });
    expect(run(mw, {}).vault).not.toBe(run(mw, {}).vault);
  });

  it("reads the mode from the header, else the run's own", () => {
    const mw = sessionMiddleware({ ...DEFAULTS, mode: "fake" });
    expect(run(mw, { headers: { "x-openmasq-mode": "token" } }).mode).toBe("token");
    expect(run(mw, {}).mode).toBe("fake");
  });
});
