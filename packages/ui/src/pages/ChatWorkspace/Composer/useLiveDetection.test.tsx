// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../testKit";
import { DETECT_DEBOUNCE_MS, MODEL_DEBOUNCE_MS } from "../composerDetection";
import type { ComposerProps } from "./types";
import { useLiveDetection, type LiveDetectionApi } from "./useLiveDetection";

/**
 * A keystroke SUPERSEDES the preview's model pass: the in-flight call's signal is aborted
 * (the host then stops the NER — `state/store/detectPii.ts`), its late answer is ignored,
 * and the send button is not held by the stale run — only by the new one, until it settles.
 */
type Call = { text: string; signal: AbortSignal; resolve: (v: { matches: { value: string; category: string }[]; engine: string }) => void };

describe("useLiveDetection — superseded preview passes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts the stale pass, ignores its answer and unblocks on the new one", async () => {
    const calls: Call[] = [];
    const onDetectPii = (text: string, signal?: AbortSignal) =>
      new Promise<{ matches: { value: string; category: string }[]; engine: string }>((resolve) => {
        calls.push({ text, signal: signal!, resolve });
      });
    let live: LiveDetectionApi | null = null;
    function Probe({ input }: { input: string }) {
      live = useLiveDetection({ input, onDetectPii } as unknown as ComposerProps);
      return null;
    }
    const ui = await mount(<Probe input="Écrire à Marie Dupont" />);
    await act(async () => void vi.advanceTimersByTime(MODEL_DEBOUNCE_MS + 10));
    expect(calls).toHaveLength(1);
    expect(live!.detecting).toBe(true);

    await ui.rerender(<Probe input="Écrire à Marie Dupont et Paul Martin" />);
    expect(calls[0]!.signal.aborted).toBe(true);
    // The stale pass answers late: ignored.
    await act(async () => calls[0]!.resolve({ matches: [{ value: "STALE", category: "name" }], engine: "local" }));
    await act(async () => void vi.advanceTimersByTime(Math.max(MODEL_DEBOUNCE_MS, DETECT_DEBOUNCE_MS) + 10));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.signal.aborted).toBe(false);
    await act(async () => calls[1]!.resolve({ matches: [{ value: "Paul Martin", category: "name" }], engine: "local" }));
    expect(live!.detecting).toBe(false);
    expect(live!.modelCats.map((c) => c.value)).toEqual(["Paul Martin"]);
    await ui.unmount();
  });

  it("clearing the draft aborts the pass and releases the send at once", async () => {
    const signals: AbortSignal[] = [];
    const onDetectPii = (_t: string, signal?: AbortSignal) => {
      signals.push(signal!);
      return new Promise<never>(() => {});
    };
    let live: LiveDetectionApi | null = null;
    function Probe({ input }: { input: string }) {
      live = useLiveDetection({ input, onDetectPii } as unknown as ComposerProps);
      return null;
    }
    const ui = await mount(<Probe input="Marie Dupont" />);
    await act(async () => void vi.advanceTimersByTime(MODEL_DEBOUNCE_MS + 10));
    await ui.rerender(<Probe input="" />);
    expect(signals[0]!.aborted).toBe(true);
    expect(live!.detecting).toBe(false);
    await ui.unmount();
  });
});
