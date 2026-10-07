// @vitest-environment jsdom
import { act, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../types";
import { DEFAULT_SETTINGS } from "../../state/storePersistence";
import { mount } from "../../testKit";
import { Onboarding } from "./Onboarding";

const { captureEvent } = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock("../../analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analytics")>()),
  captureEvent,
}));

/**
 * What the onboarding tells PostHog. `onboarding { step }` alone said where it ended and
 * nothing else: not how far each screen was reached, not whether the person has Claude
 * Code or Codex on the machine, not which road to the models they left with.
 */

function Harness({ init, keys }: { init?: Partial<Settings>; keys?: string[] }) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, ...init });
  return (
    <Onboarding
      settings={settings}
      onChange={setSettings}
      onDone={() => {}}
      keyConfigured={new Set(keys)}
    />
  );
}

const host = {
  probeClaudeCli: async () => true,
  probeCodexCli: async () => false,
};

const events = (name: string) =>
  captureEvent.mock.calls.map(([e]) => e).filter((e) => e.name === name);

beforeEach(() => captureEvent.mockClear());

describe("onboarding — la télémétrie du premier lancement", () => {
  it("compte chaque écran affiché, pas seulement le dernier", async () => {
    const m = await mount(<Harness />, { host });
    await m.click(".ob-next");
    await m.click(".ob-next");
    expect(events("onboarding_step").map((e) => e.step)).toEqual(["1", "2", "3"]);
  });

  it("dit si chaque agent est installé, une seule fois même quand la sonde repasse", async () => {
    const m = await mount(<Harness />, { host });
    await act(async () => {});
    // The probes re-run on window focus: the answer must not be counted twice.
    await act(async () => void window.dispatchEvent(new Event("focus")));
    await m.click(".ob-next");
    expect(events("agent_detected")).toEqual([
      { name: "agent_detected", agent: "claude", found: true },
      { name: "agent_detected", agent: "codex", found: false },
    ]);
  });

  it("porte sur `done` la route choisie, les agents et les fournisseurs de clé", async () => {
    const m = await mount(<Harness init={{ claudeCliEnabled: true }} keys={["openrouter", "anthropic"]} />, {
      host,
    });
    await m.click(".ob-next");
    await m.click(".ob-next");
    await m.click(".ob-next");
    expect(events("onboarding")).toEqual([
      {
        name: "onboarding",
        step: "done",
        access: "agent",
        agents: "claude",
        key_providers: "anthropic,openrouter",
        openrouter_oauth: false,
        tuned: false,
      },
    ]);
  });

  it("porte les mêmes choix sur un abandon, avec l'écran quitté", async () => {
    const m = await mount(<Harness />, { host });
    await m.click(".ob-skip");
    expect(events("onboarding")).toEqual([
      {
        name: "onboarding",
        step: "skip:1",
        access: "none",
        agents: "none",
        key_providers: "none",
        openrouter_oauth: false,
        tuned: false,
      },
    ]);
  });

  it("note le passage par « Régler finement »", async () => {
    const m = await mount(<Harness keys={["openai"]} />, { host });
    await m.click(".ob-next");
    await m.click(".ob-next");
    await m.click(".ob-tune");
    await m.click(".ob-next");
    expect(events("onboarding_step").map((e) => e.step)).toEqual(["1", "2", "3", "regler"]);
    expect(events("onboarding")[0]).toMatchObject({ step: "done", access: "key", tuned: true });
  });
});
