// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { mount } from "../../../testKit";
import type { Conversation, Settings } from "../../../types";
import { RedactionRulesModal } from "./RedactionRulesModal";

/**
 * The modal is ONE conversation's categories, nothing more: no level picker and no
 * « Par défaut » tab (the level's door is the composer button, the default's is
 * Réglages), and the way to the default is a text link that closes the modal.
 */
const fr = getMessages("fr");
const settings = { redactCategories: { person: true, email: true } } as unknown as Settings;
const conversation = { id: "c1", redactCategories: { email: false } } as unknown as Conversation;

describe("RedactionRulesModal", () => {
  it("ni sélecteur de niveau, ni onglets — les catégories de la conversation seules", async () => {
    const m = await mount(
      <RedactionRulesModal
        settings={settings}
        onChange={() => {}}
        onClose={() => {}}
        conversation={conversation}
        onChangeConversation={() => {}}
      />,
    );
    expect(m.maybe(".privacy-levels")).toBeNull();
    expect(m.maybe(".rrm-tabs")).toBeNull();
    expect(m.findAll(".rrm-cat").length).toBeGreaterThan(0);
    // The conversation's override shows as « modifié » on its chip.
    expect(m.findAll(".rrm-tag").some((t) => t.textContent === fr.redactionCatalog.modified)).toBe(true);
    await m.unmount();
  });

  it("le lien vers Réglages → Confidentialité navigue ET ferme la modale", async () => {
    const onOpenPrivacySettings = vi.fn();
    const m = await mount(
      <RedactionRulesModal
        settings={settings}
        onChange={() => {}}
        onClose={() => {}}
        conversation={conversation}
        onChangeConversation={() => {}}
        onOpenPrivacySettings={onOpenPrivacySettings}
      />,
    );
    const link = m.find(".rrm-link");
    expect(link.textContent).toBe(fr.modals.redactionRules.defaultLevelLink);
    await m.click(link);
    expect(onOpenPrivacySettings).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("sans navigation câblée, pas de lien ; un clic sur une chip écrit l'override", async () => {
    const onChangeConversation = vi.fn();
    const m = await mount(
      <RedactionRulesModal
        settings={settings}
        onChange={() => {}}
        onClose={() => {}}
        conversation={conversation}
        onChangeConversation={onChangeConversation}
      />,
    );
    expect(m.maybe(".rrm-link")).toBeNull();
    await m.click(m.findAll(".rrm-cat")[0]!);
    expect(onChangeConversation).toHaveBeenCalledTimes(1);
    // A sparse override: the existing key rides along, the clicked one joins it.
    expect(onChangeConversation.mock.calls[0]![0]).toMatchObject({ email: false });
    await m.unmount();
  });
});
