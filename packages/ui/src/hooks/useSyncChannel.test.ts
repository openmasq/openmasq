// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { onWindowFocus, onDocumentVisible, PUSH_SETTLE_MS } from "./useSyncChannel";

/**
 * The resume signal is the ONE thing desktop and mobile legitimately do differently,
 * and therefore the one thing that stayed duplicated — six copies of the sync hooks
 * existed for it. Now it is two named primitives, so these pin what each promises:
 * it fires on a real resume, it does NOT fire on the opposite edge, and it hands back
 * an unsubscribe that actually detaches (a hook that leaked its listener would keep
 * pulling for an unmounted account).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("onWindowFocus (desktop)", () => {
  it("runs on focus, and stops after unsubscribe", () => {
    const run = vi.fn();
    const off = onWindowFocus(run);

    window.dispatchEvent(new Event("focus"));
    expect(run).toHaveBeenCalledTimes(1);

    off();
    window.dispatchEvent(new Event("focus"));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("onDocumentVisible (mobile / web)", () => {
  it("runs when the document becomes visible", () => {
    const run = vi.fn();
    const off = onDocumentVisible(run);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).toHaveBeenCalledTimes(1);

    off();
  });

  it("does NOT run when the app is being BACKGROUNDED", () => {
    // visibilitychange fires on both edges. Pulling as the user leaves is not a
    // resume — it is a request racing the OS suspending the WebView.
    const run = vi.fn();
    const off = onDocumentVisible(run);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).not.toHaveBeenCalled();

    off();
  });

  it("stops after unsubscribe", () => {
    const run = vi.fn();
    const off = onDocumentVisible(run);
    off();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).not.toHaveBeenCalled();
  });
});

describe("the settle delay is one shared value", () => {
  it("is the 1.5 s every channel used to hard-code separately", () => {
    expect(PUSH_SETTLE_MS).toBe(1500);
  });
});
