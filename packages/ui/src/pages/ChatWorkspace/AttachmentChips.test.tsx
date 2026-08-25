// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { AttachmentChips } from "./AttachmentChips";
import type { Attachment } from "./Composer";

/**
 * Régression (constat 15/08) : le chip d'une pièce jointe était un `span` cliquable sans
 * rôle ni nom accessible — la SEULE porte vers l'aperçu (donc vers la vérification de ce
 * qui sera masqué avant l'envoi) ne s'ouvrait qu'à la souris, et l'arbre d'accessibilité
 * ne l'exposait pas du tout dès deux pièces.
 */

const piece = (over: Partial<Attachment> = {}): Attachment => ({
  name: "grand-livre.csv",
  kind: "csv",
  text: "Date;Débit\n01/02;10,00",
  chars: 24,
  redactPreview: 2,
  cid: "c1",
  ...over,
});

const presser = async (el: Element, key: string) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

describe("AttachmentChips — le chip est un bouton, clavier compris", () => {
  it("porte un rôle, un nom, et s'ouvre à Entrée comme à l'espace", async () => {
    const ouverts: string[] = [];
    const m = await mount(
      <AttachmentChips attachments={[piece()]} onRemove={() => {}} onOpen={(c) => ouverts.push(c)} />,
    );
    const chip = m.find('[role="button"].attach-chip');
    expect(chip.getAttribute("tabindex")).toBe("0");
    expect(chip.getAttribute("aria-label")).toContain("grand-livre.csv");
    await presser(chip, "Enter");
    await presser(chip, " ");
    expect(ouverts).toEqual(["c1", "c1"]);
    await m.unmount();
  });

  it("en cours d'extraction : annoncé indisponible, et AUCUNE ouverture", async () => {
    const ouverts: string[] = [];
    const m = await mount(
      <AttachmentChips
        attachments={[piece({ extracting: true })]}
        onRemove={() => {}}
        onOpen={(c) => ouverts.push(c)}
      />,
    );
    const chip = m.find('[role="button"].attach-chip');
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    await presser(chip, "Enter");
    expect(ouverts).toEqual([]);
    await m.unmount();
  });

  it("chaque pièce d'un lot reste un bouton nommé (le digest en voyait zéro)", async () => {
    const m = await mount(
      <AttachmentChips
        attachments={[piece(), piece({ cid: "c2", name: "releve.txt" })]}
        onRemove={() => {}}
        onOpen={() => {}}
      />,
    );
    const noms = m
      .findAll('[role="button"].attach-chip')
      .map((c) => c.getAttribute("aria-label") ?? "");
    expect(noms).toHaveLength(2);
    expect(noms[0]).toContain("grand-livre.csv");
    expect(noms[1]).toContain("releve.txt");
    await m.unmount();
  });
});
