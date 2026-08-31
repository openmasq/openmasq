// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { AttachmentChips } from "./AttachmentChips";
import type { Attachment } from "./Composer";

/**
 * Regression (noted 15/08): an attachment's chip was a clickable `span` with no
 * role or accessible name — the ONLY door to the preview (hence to checking what
 * will be masked before sending) only opened with the mouse, and the accessibility tree
 * didn't expose it at all once there were two attachments.
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
