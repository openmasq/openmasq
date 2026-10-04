// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "../../testKit";
import { DEFAULT_SETTINGS } from "../storePersistence";
import type { Host } from "../../host";
import { useDetectPii } from "./detectPii";

/**
 * The composer preview's model layer is ABANDONED when the draft changes: its signal must
 * reach the host (which stops the NER inference) and the engine (which skips its phases),
 * and an abandoned run REJECTS — the composer drops it — rather than resolving stale matches.
 */
async function preview(host: Partial<Host>) {
  const ref = <T,>(current: T) => ({ current });
  let detect: ReturnType<typeof useDetectPii> | null = null;
  function Probe() {
    detect = useDetectPii({
      settingsRef: ref({ ...DEFAULT_SETTINGS, redactEngine: "local" }),
      hostRef: ref(host as Host),
      conversationsRef: ref([]),
      activeIdRef: ref(null),
      orgProfileRef: ref(null),
      keepListRef: ref([]),
    });
    return null;
  }
  const ui = await mount(<Probe />);
  return { detect: detect!, unmount: () => ui.unmount() };
}

describe("detectPii — the preview's abort reaches the detector", () => {
  it("forwards the signal to the host and rejects once it is aborted", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const ctrl = new AbortController();
    const { detect, unmount } = await preview({
      detectLocalPii: async (_p, signal) => {
        seen.push(signal);
        ctrl.abort(); // the user typed while the NER ran
        throw new DOMException("aborted", "AbortError");
      },
    });
    await expect(detect("Marie Dupont habite à Rennes.", ctrl.signal)).rejects.toThrow(/abort/i);
    expect(seen).toEqual([ctrl.signal]);
    await unmount();
  });

  it("an already-superseded call never starts the detector", async () => {
    let calls = 0;
    const ctrl = new AbortController();
    ctrl.abort();
    const { detect, unmount } = await preview({
      detectLocalPii: async () => {
        calls++;
        return [];
      },
    });
    await expect(detect("Marie Dupont", ctrl.signal)).rejects.toThrow(/abort/i);
    expect(calls).toBe(0);
    await unmount();
  });

  it("a live call still returns the detector's findings", async () => {
    const { detect, unmount } = await preview({
      detectLocalPii: async () => [{ value: "Marie Dupont", category: "name" }],
    });
    const res = await detect("Écrire à Marie Dupont demain.", new AbortController().signal);
    expect(res.matches.map((m) => m.value)).toContain("Marie Dupont");
    await unmount();
  });
});
