import { describe, expect, it, vi } from "vitest";
import { mountTooltips, mountTooltipsWhenReady } from "./tooltip";

/*
 * ⚠️ THE BUNDLE IS LOADED FROM `<head>`, where `document.body` is still null.
 *
 * That one fact cost two symptoms that looked unrelated to each other and to tooltips. The
 * bundle is an IIFE assigned to a global, so anything thrown while it evaluates means the
 * global is never assigned AT ALL: the page then found no API, and
 *   - every control went inert, because the first call into the API threw before a single
 *     handler had been attached;
 *   - once that was guarded, the masking panel redrew on EVERY poll, because the "did
 *     anything change" watch it could not reach answers yes by default.
 * Neither of those reads as "a tooltip mounted too early".
 *
 * So: nothing in this bundle may touch the DOM at evaluation time. These tests are the guard,
 * and they run against a document whose `body` is null — which is what a `<head>` is.
 */
const headDocument = () => {
  const listeners = new Map<string, () => void>();
  return {
    body: null as unknown,
    documentElement: { clientWidth: 1200, clientHeight: 800 },
    createElement: () => ({
      setAttribute() {},
      style: {},
      classList: { toggle() {} },
      hidden: true,
      remove() {},
    }),
    addEventListener(ev: string, fn: () => void) {
      listeners.set(ev, fn);
    },
    removeEventListener() {},
    fire(ev: string) {
      listeners.get(ev)?.();
    },
    waiting: (ev: string) => listeners.has(ev),
  };
};

describe("mounting from a head that has no body yet", () => {
  it("does not throw — a throw here would cost the whole bundle's global", () => {
    const doc = headDocument();
    expect(() => mountTooltipsWhenReady(doc as never)).not.toThrow();
  });

  it("waits for the DOM instead, and mounts once it is there", () => {
    const doc = headDocument();
    mountTooltipsWhenReady(doc as never);
    expect(doc.waiting("DOMContentLoaded")).toBe(true);
    doc.body = { appendChild: vi.fn() };
    expect(() => doc.fire("DOMContentLoaded")).not.toThrow();
    expect((doc.body as { appendChild: ReturnType<typeof vi.fn> }).appendChild).toHaveBeenCalled();
  });

  it("mounts straight away when there IS a body — the script moved, or ran late", () => {
    const doc = headDocument();
    const appendChild = vi.fn();
    doc.body = { appendChild };
    mountTooltipsWhenReady(doc as never);
    expect(appendChild).toHaveBeenCalled();
    expect(doc.waiting("DOMContentLoaded")).toBe(false);
  });

  it("still tears itself down cleanly", () => {
    const doc = headDocument();
    doc.body = { appendChild: vi.fn() };
    expect(() => mountTooltips(doc as never).stop()).not.toThrow();
  });
});
