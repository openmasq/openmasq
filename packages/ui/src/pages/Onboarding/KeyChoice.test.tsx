// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { PROVIDERS } from "@openmasq/llm";
import { mount } from "../../testKit";
import { getMessages } from "@openmasq/i18n";
import { providerKeyHelp } from "../../containers/modals/providerKeyHelp";
import { KeyChoice } from "./KeyChoice";
import type { AgentOptIn } from "../../hooks/useAgentOptIns";
import { configurePlatformAccess } from "../../send/platformAccess";

/**
 * The "Abonnement, ou votre clé" screen at first launch.
 *
 * It shipped without a test, and it's the only onboarding screen that WRITES a secret. What
 * is checked here is therefore not the layout but the three promises the screen
 * makes to the person pasting their key:
 *
 *  1. the key goes to the RIGHT provider — filing it under the wrong one is invisible on
 *     the screen and is only discovered on the first send, as an error that doesn't
 *     name its cause;
 *  2. a save failure is SAID — without that, you walk away believing your key is set
 *     when it exists nowhere (product rule: a real failure is always
 *     shown, never swallowed);
 *  3. the key is never READ BACK by the UI — it's encrypted on the privileged side, and
 *     the screen must not keep it on screen or in the DOM after sending it.
 */

const noop = () => {};

// The package's default (a hosted build) — restored so test order doesn't matter.
afterEach(() => configurePlatformAccess({ served: true }));

describe("KeyChoice — l'accès aux modèles au premier lancement", () => {
  it("envoie la clé au fournisseur SÉLECTIONNÉ, débarrassée de ses espaces", async () => {
    const saved: { provider: string; key: string }[] = [];
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async (provider, key) => {
          saved.push({ provider, key });
        }}
        keyConfigured={new Set()}
      />,
    );

    // We explicitly pick Anthropic: the default value is OpenRouter, so wiring
    // that ignored the selection would go unnoticed without this click.
    const anthropic = m
      .findAll(".ob-access-provider")
      .find((b) => b.textContent?.includes(PROVIDERS.anthropic.label))!;
    await m.click(anthropic);
    await m.type(".ob-access-input", "  sk-ant-secret  ");
    await m.click(".ob-access-save");

    expect(saved).toEqual([{ provider: "anthropic", key: "sk-ant-secret" }]);

    await m.unmount();
  });

  it("DIT l'échec au lieu de laisser croire que la clé est posée", async () => {
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async () => {
          throw new Error("trousseau verrouillé");
        }}
        keyConfigured={new Set()}
      />,
    );

    await m.type(".ob-access-input", "sk-test");
    await m.click(".ob-access-save");

    // The refusal's message, not a generic « Réessayez » that would lose the cause.
    expect(m.find(".ob-access-error").textContent).toContain("trousseau verrouillé");
    // And the button becomes actionable again: a failure that leaves « Enregistrement… » on
    // screen is a dead end.
    expect(m.find<HTMLButtonElement>(".ob-access-save").disabled).toBe(false);

    await m.unmount();
  });

  it("ne garde la clé NULLE PART dans le DOM une fois envoyée", async () => {
    const SECRET = "sk-ne-doit-pas-rester";
    const m = await mount(
      <KeyChoice mode="byo" onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );

    await m.type(".ob-access-input", SECRET);
    await m.click(".ob-access-save");

    expect(m.find<HTMLInputElement>(".ob-access-input").value).toBe("");
    expect(m.el.innerHTML).not.toContain(SECRET);

    await m.unmount();
  });

  it("masque la saisie — une clé collée ne se lit pas par-dessus l'épaule", async () => {
    const m = await mount(
      <KeyChoice mode="byo" onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );
    expect(m.find<HTMLInputElement>(".ob-access-input").type).toBe("password");
    await m.unmount();
  });

  it("ne redemande pas une clé déjà enregistrée — il n'y a rien à ressaisir", async () => {
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async () => {}}
        keyConfigured={new Set(["openrouter"])}
      />,
    );

    expect(m.maybe(".ob-access-input")).toBeNull();
    expect(m.find(".ob-access-saved").textContent).toContain(PROVIDERS.openrouter.label);

    await m.unmount();
  });

  it("guide vers la clé du fournisseur choisi, sans retaper son adresse", async () => {
    const m = await mount(
      <KeyChoice mode="byo" onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );

    // The checkable steps for the selected provider, and the OFFICIAL registry link.
    expect(m.findAll(".byo-steps li").length).toBeGreaterThan(0);
    expect(m.find<HTMLAnchorElement>(".byo-link").href).toBe(
      providerKeyHelp("openrouter", getMessages("fr"))!.keyUrl,
    );

    // Changing provider changes the guide AND starts over from a blank list: a tick
    // inherited from the previous provider is a false bookmark.
    await m.click(
      m
        .findAll(".ob-access-provider")
        .find((b) => b.textContent?.includes(PROVIDERS.openai.label))!,
    );
    await m.click(".byo-tick");
    expect(m.find(".byo-steps li").className).toContain("done");
    await m.click(
      m
        .findAll(".ob-access-provider")
        .find((b) => b.textContent?.includes(PROVIDERS.anthropic.label))!,
    );
    expect(m.find(".byo-steps li").className).not.toContain("done");

    await m.unmount();
  });

  it("dit au collage qu'une clé vient visiblement d'un autre fournisseur — sans bloquer", async () => {
    const saved: string[] = [];
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async (_p, key) => {
          saved.push(key);
        }}
        keyConfigured={new Set()}
      />,
    );

    await m.type(".ob-access-input", "sk-ant-0123456789abcdef0123");
    expect(m.find(".byo-issue").className).toContain("error");
    expect(m.find(".byo-issue").textContent).toContain("sk-or-");

    // The verdict explains, it doesn't forbid: the prefix is documentation, not
    // a contract, and blocking on an outdated form would be a dead end.
    expect(m.find<HTMLButtonElement>(".ob-access-save").disabled).toBe(false);
    await m.click(".ob-access-save");
    expect(saved).toHaveLength(1);

    await m.unmount();
  });

  it("sans `host.keys` (aperçu web) le formulaire n'existe pas — la plateforme dégrade en silence", async () => {
    const m = await mount(<KeyChoice mode="byo" onMode={noop} keyConfigured={new Set()} />);

    expect(m.maybe(".ob-access-key")).toBeNull();
    // The CHOICE is still offered: it's the form that's missing, not the step.
    expect(m.findAll(".ob-access-opt")).toHaveLength(2);

    await m.unmount();
  });

  it("sans service hébergé, la carte « Mon compte » n'existe pas et le formulaire s'ouvre seul", async () => {
    // A build with no backend (`SELF_HOSTING.md`) has NO subscription to offer: offering
    // the choice would be offering a door that leads nowhere. Only one path remains,
    // so no more question — the form is the step.
    configurePlatformAccess({ served: false });
    const m = await mount(
      <KeyChoice mode={null} onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );

    expect(m.findAll(".ob-access-opt")).toHaveLength(1);
    expect(m.find(".ob-access-opt").textContent).toMatch(/clé/i);
    expect(m.maybe(".ob-access-key")).not.toBeNull();

    await m.unmount();
  });

  it("en mode abonnement, aucun champ de clé — l'étape ne réclame rien", async () => {
    const m = await mount(
      <KeyChoice
        mode="subscription"
        onMode={noop}
        onSaveKey={async () => {}}
        keyConfigured={new Set()}
      />,
    );

    expect(m.maybe(".ob-access-key")).toBeNull();
    expect(m.find(".ob-access-opt").getAttribute("aria-pressed")).toBe("true");

    await m.unmount();
  });

  /* The third road. The subtitle promised « ou votre abonnement Claude Code / Codex » while
     nothing on the screen led to it: the card is that door, and it only exists when the
     build can offer an agent (the list comes from the same hook as Réglages → Modèles). */
  const agent = (over: Partial<AgentOptIn> = {}): AgentOptIn => ({
    pid: "claude-cli",
    cli: "claude",
    copy: getMessages("fr").modelPicker.cli.claude,
    detected: true,
    enabled: false,
    onEnabled: () => {},
    ...over,
  });
  const cardTitled = (m: Awaited<ReturnType<typeof mount>>, title: string) =>
    m.findAll(".ob-access-opt").find((b) => b.textContent?.includes(title))!;
  const agentTitle = getMessages("fr").onboarding.keyChoice.agent.title;

  it("sans agent probeable, la carte « abonnement CLI » n'existe pas", async () => {
    const m = await mount(<KeyChoice mode={null} onMode={noop} keyConfigured={new Set()} />);
    expect(cardTitled(m, agentTitle)).toBeUndefined();
    await m.unmount();
  });

  it("la carte ouvre un interrupteur par agent — le MÊME opt-in que Réglages — et range le formulaire de clé", async () => {
    const flips: boolean[] = [];
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async () => {}}
        keyConfigured={new Set()}
        agents={[
          agent({ onEnabled: (on) => flips.push(on) }),
          agent({
            pid: "codex-cli",
            cli: "codex",
            copy: getMessages("fr").modelPicker.cli.codex,
            detected: false,
          }),
        ]}
      />,
    );
    // The key form is open (mode byo), the agent panel is not.
    expect(m.maybe(".ob-access-providers")).not.toBeNull();
    expect(m.maybe(".ob-access-agents")).toBeNull();

    await m.click(cardTitled(m, agentTitle));
    expect(cardTitled(m, agentTitle).getAttribute("aria-pressed")).toBe("true");
    expect(m.maybe(".ob-access-providers")).toBeNull();
    const rows = m.findAll(".ob-access-agent");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(getMessages("fr").modelPicker.cli.claude.rowTitle);
    // A CLI the probe did not find is still offered, with the install words.
    expect(rows[1].textContent).toContain(getMessages("fr").modelPicker.cli.codex.missingDesc);
    expect(rows[1].className).toContain("missing");

    await m.click(rows[0].querySelector('[role="switch"]')!);
    expect(flips).toEqual([true]);

    // Back to the key card: the form returns, the panel goes.
    await m.click(cardTitled(m, getMessages("fr").onboarding.keyChoice.ownKey.title));
    expect(m.maybe(".ob-access-agents")).toBeNull();
    expect(m.maybe(".ob-access-providers")).not.toBeNull();
    await m.unmount();
  });

  it("revenir sur l'étape avec un agent déjà activé rouvre sa carte", async () => {
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async () => {}}
        keyConfigured={new Set()}
        agents={[agent({ enabled: true })]}
      />,
    );
    expect(cardTitled(m, agentTitle).getAttribute("aria-pressed")).toBe("true");
    expect(m.find('.ob-access-agent [role="switch"]').getAttribute("aria-checked")).toBe("true");
    expect(m.maybe(".ob-access-providers")).toBeNull();
    await m.unmount();
  });
});
