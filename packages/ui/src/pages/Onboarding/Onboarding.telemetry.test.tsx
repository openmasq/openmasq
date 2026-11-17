// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../types";
import { DEFAULT_SETTINGS } from "../../state/storePersistence";
import { mount } from "../../testKit";
import { configurePlatformAccess } from "../../send/platformAccess";
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
afterEach(() => configurePlatformAccess({ served: true }));

describe("onboarding — la télémétrie du premier lancement", () => {
  it("compte chaque écran affiché, pas seulement le dernier", async () => {
    const m = await mount(<Harness keys={["openai"]} />, { host });
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
    const m = await mount(<Harness keys={["openai"]} />, { host });
    await m.click(".ob-skip");
    expect(events("onboarding")).toEqual([
      {
        name: "onboarding",
        step: "skip:1",
        access: "key",
        agents: "none",
        key_providers: "openai",
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

  // A build that serves nothing (the shipped default): without a road, no model answers.
  it("sans accès, l'étape ne se quitte pas : pas de « Passer », « Suivant » dit ce qui manque", async () => {
    configurePlatformAccess({ served: false });
    const m = await mount(<Harness />, { host });
    await act(async () => {});
    expect(m.maybe(".ob-skip")).toBeNull();
    await m.click(".ob-next");
    await m.click(".ob-next");
    expect(m.maybe(".ob-access-required")).not.toBeNull();
    expect(events("onboarding_step").map((e) => e.step)).toEqual(["1", "2"]);
    expect(events("onboarding_blocked")).toHaveLength(1);
    expect(events("onboarding")).toEqual([]);
  });

  it("un agent allumé mais introuvable n'ouvre pas la route", async () => {
    configurePlatformAccess({ served: false });
    const m = await mount(<Harness init={{ codexCliEnabled: true }} />, { host });
    await act(async () => {});
    await m.click(".ob-next");
    await m.click(".ob-next");
    expect(events("onboarding_blocked")).toHaveLength(1);
    // Codex switched on, only Claude on the machine: the two halves of the cause, told apart.
    expect(events("onboarding_blocked")[0]).toMatchObject({ agents: "codex", detected: "claude" });
  });

  it("sans rien pour ouvrir une route (ni trousseau, ni agent), l'écran ne piège personne", async () => {
    configurePlatformAccess({ served: false });
    const m = await mount(<Harness />, { host: {} });
    await m.click(".ob-next");
    await m.click(".ob-next");
    expect(events("onboarding_step").map((e) => e.step)).toEqual(["1", "2", "3"]);
    expect(m.maybe(".ob-skip")).not.toBeNull();
  });

  it("un build qui sert un modèle ne bloque pas : le compte est une route", async () => {
    const m = await mount(<Harness />, { host });
    await act(async () => {});
    await m.click(".ob-next");
    await m.click(".ob-next");
    expect(events("onboarding_blocked")).toEqual([]);
    expect(events("onboarding_step").map((e) => e.step)).toEqual(["1", "2", "3"]);
  });

  it("« Retour » ramène à l'écran précédent, sans jamais servir de sortie au blocage", async () => {
    configurePlatformAccess({ served: false });
    const m = await mount(<Harness />, { host });
    await act(async () => {});
    expect(m.maybe(".ob-back")).toBeNull(); // first screen: nothing to go back to
    await m.click(".ob-next");
    expect(m.maybe(".ob-access")).not.toBeNull();
    await m.click(".ob-back");
    expect(m.maybe(".ob-access")).toBeNull();
    expect(m.maybe(".ob-skip")).toBeNull(); // still gated: going back is not « Passer »
  });

  it("l'écran final redit la route choisie, au lieu de réclamer un accès déjà là", async () => {
    configurePlatformAccess({ served: false });
    const m = await mount(<Harness keys={["anthropic"]} />, { host });
    await m.click(".ob-next");
    await m.click(".ob-next");
    const fr = (await import("@openmasq/i18n")).getMessages("fr");
    expect(m.find(".ob-sub").textContent).toBe(fr.onboarding.ready.subKey);
  });
});
