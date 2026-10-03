// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { mount } from "../../../testKit";
import { AttachmentChips } from "./AttachmentChips";
import type { Attachment } from "../Composer";
import { MANY_FILES, stagedSummary } from "./summary";

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

  it("en cours d'OCR : s'ouvre quand même (l'aperçu montre un chargement), et dit la page lue", async () => {
    const ouverts: string[] = [];
    const m = await mount(
      <AttachmentChips
        attachments={[piece({ extracting: true, extractProgress: { done: 2, total: 12 } })]}
        onRemove={() => {}}
        onOpen={(c) => ouverts.push(c)}
      />,
    );
    const chip = m.find('[role="button"].attach-chip');
    expect(chip.getAttribute("aria-disabled")).toBeNull();
    expect(chip.getAttribute("aria-label")).toContain("3/12");
    await presser(chip, "Enter");
    expect(ouverts).toEqual(["c1"]);
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

describe("AttachmentChips — many files: summary, bounded area, « Tout retirer »", () => {
  const batch = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      piece({
        cid: `c${i}`,
        name: `piece-${i}.pdf`,
        ...(i < 3 ? { extracting: true } : {}),
        ...(i === 3 ? { error: "Lecture impossible", text: "" } : {}),
        ...(i === 4 ? { redacting: true } : {}),
      }),
    );

  it("under the threshold the row is the plain chips, no summary", async () => {
    const m = await mount(<AttachmentChips attachments={batch(MANY_FILES - 1)} onRemove={() => {}} onOpen={() => {}} />);
    expect(m.maybe(".attach-summary")).toBeNull();
    expect(m.find(".attach-chips").classList.contains("is-bounded")).toBe(false);
    await m.unmount();
  });

  it("32 files: one summary line, a bounded list, and every chip still there", async () => {
    const m = await mount(<AttachmentChips attachments={batch(32)} onRemove={() => {}} onOpen={() => {}} />);
    expect(m.find(".attach-summary-text").textContent).toBe(
      "32 fichiers · 3 en lecture · 1 en masquage · 1 illisible",
    );
    expect(m.find(".attach-chips").classList.contains("is-bounded")).toBe(true);
    expect(m.findAll(".attach-chip")).toHaveLength(32);
    await m.unmount();
  });

  it("« Tout retirer » asks once, then removes every chip through onRemove, last to first", async () => {
    const removed: number[] = [];
    const m = await mount(<AttachmentChips attachments={batch(10)} onRemove={(i) => removed.push(i)} onOpen={() => {}} />);
    const btn = m.find<HTMLButtonElement>("button.attach-remove-all");
    expect(btn.textContent).toBe("Tout retirer");
    await m.click(btn);
    expect(removed).toEqual([]);
    expect(btn.textContent).toBe("Retirer les 10 fichiers de ce message ?");
    await m.click(btn);
    expect(removed).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    await m.unmount();
  });

  it("the summary leaves a zero count out", () => {
    const s = stagedSummary([piece(), piece({ cid: "c2" })]);
    expect(s).toEqual({ total: 2, reading: 0, masking: 0, unreadable: 0 });
  });
});
