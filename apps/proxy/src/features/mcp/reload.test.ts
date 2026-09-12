import { describe, expect, it } from "vitest";
import type { ServerSpec } from "./servers";
import { createSignal, watchIntegrations } from "./reload";

const spec = (id: string, url = `https://${id}.example/mcp`): ServerSpec => ({
  id,
  transport: "http",
  url,
  headers: {},
});

type Listener = (event: string, name: string | null) => void;

/** A watcher we can poke, a store we can sign in to, an upstream that records what it got. */
const harness = (initial: ServerSpec[]) => {
  let listener: Listener | undefined;
  const applied: { specs: string[]; changed: string[] }[] = [];
  const notes: string[] = [];
  const moved: string[][] = [];
  const state = { specs: initial, tokens: new Map<string, string>(), fail: "" };
  const reloader = watchIntegrations(initial, {
    dir: "/home/u/.openmasq",
    resolve: () => {
      if (state.fail) throw new Error(state.fail);
      return state.specs;
    },
    credentials: (id) => state.tokens.get(id) ?? "",
    apply: async (specs, changed) => {
      applied.push({ specs: specs.map((s) => s.id), changed: [...changed].sort() });
      return [
        ...changed,
        ...specs.map((s) => s.id).filter((id) => !initial.some((s) => s.id === id)),
      ];
    },
    onChanged: (ids) => moved.push(ids),
    note: (t) => notes.push(t),
    watchFn: ((_dir: string, cb: Listener) => {
      listener = cb;
      return { on: () => {}, close: () => {} };
    }) as never,
    debounceMs: 0,
  });
  const touch = (name: string) => listener?.("change", name);
  const settle = () => new Promise((r) => setTimeout(r, 5));
  return { reloader, applied, notes, moved, state, touch, settle };
};

describe("reloading the integrations while the proxy runs", () => {
  it("a login on a declared server is a CHANGE for that id alone, and the agent is told", async () => {
    const h = harness([spec("notion"), spec("crm")]);
    h.state.tokens.set("notion", "fp-after-login");
    h.touch("mcp-auth.enc");
    await h.settle();
    expect(h.applied).toEqual([{ specs: ["notion", "crm"], changed: ["notion"] }]);
    expect(h.moved).toEqual([["notion"]]);
    // The same state again moves nothing, and the agent is not told twice.
    h.touch("mcp-auth.enc");
    await h.settle();
    expect(h.applied).toHaveLength(2);
    expect(h.applied[1].changed).toEqual([]);
    expect(h.moved).toHaveLength(1);
  });

  it("an edited servers file adds and removes by id, nothing else is touched", async () => {
    const h = harness([spec("notion")]);
    h.state.specs = [spec("notion"), spec("github")];
    h.touch("mcp.json");
    await h.settle();
    expect(h.applied[0]).toEqual({ specs: ["notion", "github"], changed: [] });
    // …and an entry rewritten (another URL) is a change for that id.
    h.state.specs = [spec("notion", "https://mcp.notion.com/v2"), spec("github")];
    h.touch("mcp.json");
    await h.settle();
    expect(h.applied[1].changed).toEqual(["notion"]);
  });

  it("ignores files that are not the servers or the store, and one burst is one reload", async () => {
    const h = harness([spec("notion")]);
    h.touch("proxy.log");
    h.touch("key");
    await h.settle();
    expect(h.applied).toEqual([]);
    h.touch("mcp.json");
    h.touch("mcp.json");
    h.touch("mcp-auth.enc");
    await h.settle();
    expect(h.applied).toHaveLength(1);
  });

  it("keeps what it had when the file cannot be read, and says so", async () => {
    const h = harness([spec("notion")]);
    h.state.fail = "mcp.json: not valid JSON";
    h.touch("mcp.json");
    await h.settle();
    expect(h.applied).toEqual([]);
    expect(h.notes[0]).toMatch(/not reloaded: mcp.json: not valid JSON/);
  });

  it("a signal fans out to every listener and forgets one that left", () => {
    const s = createSignal();
    const hits: string[] = [];
    const off = s.on(() => hits.push("a"));
    s.on(() => hits.push("b"));
    s.emit();
    off();
    s.emit();
    expect(hits).toEqual(["a", "b", "b"]);
  });
});
