// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { clickOutside, mount, pressKey } from "../../testKit";
import { ComposerAddMenu } from "./ComposerAddMenu";

/**
 * The « + » is the composer's single door for adding something: the four entries in
 * a fixed order, each drawn ONLY when its way in exists on this platform, each
 * closing the menu after acting — and the menu dismissing like every other popover.
 */
const fr = getMessages("fr");
const trigger = `button[aria-label="${fr.composer.add}"]`;

describe("ComposerAddMenu", () => {
  it("un bouton « + » ; le menu liste Fichier · Dossier · Connecteur · Compétence", async () => {
    const m = await mount(
      <ComposerAddMenu onFile={() => {}} onFolder={() => {}} onConnector={() => {}} onSkill={() => {}} />,
    );
    expect(m.find(trigger).getAttribute("aria-haspopup")).toBe("menu");
    expect(m.maybe('[role="menu"]')).toBeNull();
    await m.click(trigger);
    expect(m.findAll('[role="menuitem"]').map((b) => b.textContent)).toEqual([
      fr.composer.addFile,
      fr.composer.addFolder,
      fr.composer.addConnector,
      fr.composer.addSkill,
    ]);
    expect(m.find(trigger).getAttribute("aria-expanded")).toBe("true");
    await m.unmount();
  });

  it("une entrée sans porte n'est pas dessinée ; sans aucune, pas de bouton du tout", async () => {
    const m = await mount(<ComposerAddMenu onFile={() => {}} onSkill={() => {}} />);
    await m.click(trigger);
    expect(m.findAll('[role="menuitem"]').map((b) => b.textContent)).toEqual([
      fr.composer.addFile,
      fr.composer.addSkill,
    ]);
    await m.unmount();
    const none = await mount(<ComposerAddMenu />);
    expect(none.maybe(trigger)).toBeNull();
    await none.unmount();
  });

  it("choisir une entrée agit ET ferme le menu", async () => {
    const onFolder = vi.fn();
    const m = await mount(<ComposerAddMenu onFile={() => {}} onFolder={onFolder} />);
    await m.click(trigger);
    await m.click(`[role="menuitem"][title="${fr.composer.addFolderTip}"]`);
    expect(onFolder).toHaveBeenCalledTimes(1);
    expect(m.maybe('[role="menu"]')).toBeNull();
    await m.unmount();
  });

  it("Escape et un clic ailleurs ferment le menu, sans rien déclencher", async () => {
    const onFile = vi.fn();
    const m = await mount(<ComposerAddMenu onFile={onFile} />);
    await m.click(trigger);
    expect(m.maybe('[role="menu"]')).not.toBeNull();
    await pressKey("Escape");
    expect(m.maybe('[role="menu"]')).toBeNull();
    await m.click(trigger);
    await clickOutside();
    expect(m.maybe('[role="menu"]')).toBeNull();
    expect(onFile).not.toHaveBeenCalled();
    await m.unmount();
  });
});
