import { describe, expect, it } from "vitest";
import { wrappedEnv } from "../wrap";
import { handleKey, KEY_HINTS, type KeyActions } from "./keys";
import { createReporter } from "./reporter";

const CTRL_C = String.fromCharCode(3);

const fake = (refuse = false) => {
  const lines: string[] = [];
  const reporter = createReporter({ write: (l) => lines.push(l), colors: false, now: () => 0 });
  const calls: string[] = [];
  const actions: KeyActions = {
    cycleLevel: async () => {
      calls.push("level");
      return refuse
        ? { level: "standard" as const, refused: "renforce needs the on-device model" }
        : { level: "strict" as const };
    },
    toggleMode: () => {
      calls.push("mode");
      return "token";
    },
    toggleReveal: () => {
      calls.push("reveal");
      return true;
    },
    envLines: () => ["OPENAI_BASE_URL=http://127.0.0.1:1/v1"],
    quit: () => {
      calls.push("quit");
    },
  };
  return { lines, reporter, calls, actions };
};

describe("keys", () => {
  it("turns the runtime dials and says what changed", async () => {
    const f = fake();
    await handleKey("l", f.reporter, f.actions);
    await handleKey("m", f.reporter, f.actions);
    await handleKey("f", f.reporter, f.actions);
    expect(f.calls).toEqual(["level", "mode", "reveal"]);
    expect(f.lines.join("\n")).toContain("level → strict");
    expect(f.lines.join("\n")).toContain("opaque tokens");
    expect(f.lines.join("\n")).toContain("real data on this screen");
  });

  it("says why a level was refused instead of claiming a change that did not happen", async () => {
    const f = fake(true);
    await handleKey("l", f.reporter, f.actions);
    const out = f.lines.join("\n");
    expect(out).toContain("needs the on-device model");
    expect(out).not.toContain("level → ");
  });

  it("quits on q and on Ctrl-C, ignores an unknown key, lists the keys on ?", async () => {
    const f = fake();
    await handleKey("z", f.reporter, f.actions);
    expect(f.lines).toEqual([]);
    await handleKey("?", f.reporter, f.actions);
    for (const h of KEY_HINTS) expect(f.lines[0]).toContain(`[${h.key}] ${h.label}`);
    await handleKey("q", f.reporter, f.actions);
    await handleKey(CTRL_C, f.reporter, f.actions);
    expect(f.calls).toEqual(["quit", "quit"]);
  });

  it("hands a wrapped tool the three base URLs on top of its own env", () => {
    const env = wrappedEnv("http://127.0.0.1:8787", {
      HOME: "/h",
      OPENAI_BASE_URL: "https://elsewhere",
    });
    expect(env).toEqual({
      HOME: "/h",
      OPENAI_BASE_URL: "http://127.0.0.1:8787/v1",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:8787",
      GOOGLE_GEMINI_BASE_URL: "http://127.0.0.1:8787",
    });
  });
});
