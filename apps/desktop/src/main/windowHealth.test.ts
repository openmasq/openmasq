import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({ app: { quit: () => {} }, dialog: {} }));
vi.mock("./i18n", () => ({ mainMessages: () => ({}) }));
vi.mock("./runtime/errorReport", () => ({ reportMainError: () => {} }));

const { windowHealth, goneCode, choiceOf, HUNG_ASK_MS } = await import("./windowHealth");

// The property: a main window that hangs or whose page is gone is SAID to the person, with a
// way back, and reported as a bounded code — and a window that recovers on its own is left alone.
function wire(answer: "reload" | "wait" | "quit" = "reload") {
  let timer: (() => void) | null = null;
  const d = {
    ask: vi.fn(async (_kind: "hung" | "gone", _oom: boolean) => answer),
    reload: vi.fn(),
    quit: vi.fn(),
    report: vi.fn(),
    setTimer: vi.fn((fn: () => void, ms: number) => {
      expect(ms).toBe(HUNG_ASK_MS);
      timer = fn;
      return () => {
        timer = null;
      };
    }),
  };
  return { d, h: windowHealth(d), fire: () => timer?.(), armed: () => timer !== null };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("goneCode — the reason as an allow-listed code", () => {
  it("says nothing of a clean exit, names the known reasons, and folds the rest into `other`", () => {
    expect(goneCode("clean-exit")).toBeNull();
    expect(goneCode("oom")).toBe("renderer-oom");
    expect(goneCode("crashed")).toBe("renderer-crashed");
    expect(goneCode("https://evil.example/?q=Marie Morvan")).toBe("renderer-other");
  });
  it("maps the buttons", () => {
    expect([choiceOf("hung", 0), choiceOf("hung", 1), choiceOf("gone", 0), choiceOf("gone", 1)]).toEqual([
      "reload",
      "wait",
      "reload",
      "quit",
    ]);
  });
});

describe("a hung window", () => {
  it("that recovers before the delay is neither reported nor asked about", async () => {
    const { d, h, fire, armed } = wire();
    h.unresponsive();
    h.unresponsive(); // one episode, one timer
    expect(d.setTimer).toHaveBeenCalledTimes(1);
    h.responsive();
    expect(armed()).toBe(false);
    fire();
    await settle();
    expect(d.report).not.toHaveBeenCalled();
    expect(d.ask).not.toHaveBeenCalled();
  });

  it("still hung at the delay is reported once and the person is offered a reload", async () => {
    const { d, h, fire } = wire("reload");
    h.unresponsive();
    fire();
    await settle();
    expect(d.report).toHaveBeenCalledWith("unresponsive");
    expect(d.ask).toHaveBeenCalledWith("hung", false);
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("« Attendre » changes nothing", async () => {
    const { d, h, fire } = wire("wait");
    h.unresponsive();
    fire();
    await settle();
    expect(d.reload).not.toHaveBeenCalled();
    expect(d.quit).not.toHaveBeenCalled();
  });
});

describe("a page that is gone", () => {
  it("is reported with its reason and offered a reload; out-of-memory is said as such", async () => {
    const { d, h } = wire("reload");
    h.gone("oom");
    await settle();
    expect(d.report).toHaveBeenCalledWith("renderer-oom");
    expect(d.ask).toHaveBeenCalledWith("gone", true);
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("asks one question at a time, and « Quitter » quits", async () => {
    const { d, h } = wire("quit");
    h.gone("crashed");
    h.gone("crashed"); // a second event while the dialog is up
    await settle();
    expect(d.ask).toHaveBeenCalledTimes(1);
    expect(d.report).toHaveBeenCalledTimes(2);
    expect(d.quit).toHaveBeenCalledTimes(1);
  });

  it("a clean exit (the window was closed) is nothing", async () => {
    const { d, h } = wire();
    h.gone("clean-exit");
    await settle();
    expect(d.report).not.toHaveBeenCalled();
    expect(d.ask).not.toHaveBeenCalled();
  });
});
