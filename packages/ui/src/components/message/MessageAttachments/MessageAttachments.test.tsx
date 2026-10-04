// @vitest-environment jsdom
import { BRAND } from "@openmasq/branding";
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../../testKit";
import type { Message } from "../../../types";
import { MessageNotices } from "../MessageNotices";
import { MessageAttachments } from "./MessageAttachments";
import { FILES_SUMMARY_AFTER } from "./fileList";

const files = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `piece-${i + 1}.pdf`, kind: "pdf" }));

describe("MessageAttachments — compact cards, a long list folds into one row", () => {
  it(`up to ${FILES_SUMMARY_AFTER} files: one card each, and a click opens THAT file`, async () => {
    const onOpen = vi.fn();
    const m = await mount(<MessageAttachments attachments={files(FILES_SUMMARY_AFTER)} onOpen={onOpen} owner="u-few" />);
    const cards = m.findAll("button.msg-filecard");
    expect(cards).toHaveLength(FILES_SUMMARY_AFTER);
    expect(m.maybe(".msg-attachments > button.msg-file")).toBeNull();
    expect(cards[2].getAttribute("title")).toBe("Consulter piece-3.pdf");
    expect(cards[2].querySelector(".msg-filecard-ext")?.textContent).toBe("PDF");
    await m.click(cards[2]);
    expect(onOpen).toHaveBeenCalledWith("piece-3.pdf");
    await m.unmount();
  });

  it("past the bound: a « N fichiers » row that opens the grid and folds it back", async () => {
    const onOpen = vi.fn();
    const m = await mount(<MessageAttachments attachments={files(8)} onOpen={onOpen} owner="u-many" />);
    expect(m.findAll("button.msg-filecard")).toHaveLength(0);
    const summary = m.find<HTMLButtonElement>(".msg-attachments > button.msg-file");
    expect(summary.textContent).toBe("8 fichiers");
    expect(summary.getAttribute("aria-expanded")).toBe("false");

    await m.click(summary);
    expect(m.findAll("button.msg-filecard")).toHaveLength(8);
    await m.click(m.findAll("button.msg-filecard")[7]);
    expect(onOpen).toHaveBeenCalledWith("piece-8.pdf");

    const fold = m.find<HTMLButtonElement>("button.msg-fold");
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    await m.click(fold);
    expect(m.findAll("button.msg-filecard")).toHaveLength(0);
    expect(m.find(".msg-attachments > button.msg-file").textContent).toBe("8 fichiers");
    await m.unmount();
  });

  it("an opened list stays open when the virtualised thread remounts its row", async () => {
    const a = await mount(<MessageAttachments attachments={files(6)} onOpen={() => {}} owner="u-remount" />);
    await a.click(".msg-attachments > button.msg-file");
    await a.unmount();
    const b = await mount(<MessageAttachments attachments={files(6)} onOpen={() => {}} owner="u-remount" />);
    expect(b.findAll("button.msg-filecard")).toHaveLength(6);
    await b.unmount();
  });

  it("a generated file keeps its eyebrow, from the catalogue", async () => {
    const m = await mount(<MessageAttachments attachments={files(1)} onOpen={() => {}} generated />);
    expect(m.find(".msg-filecard-eyebrow").textContent).toBe(`Généré par ${BRAND.name}`);
    await m.unmount();
  });

  it("a document the wire cut says so on its card and under the list", async () => {
    const m = await mount(
      <MessageAttachments
        attachments={[{ name: "bail.pdf", kind: "pdf", clipped: true }, { name: "note.txt", kind: "txt" }]}
        onOpen={() => {}}
      />,
    );
    expect(m.findAll(".msg-file-cut")).toHaveLength(1);
    expect(m.find(".msg-attachments .shield-caption").textContent).toMatch(
      /Seuls les 50\s000 premiers caractères de bail\.pdf ont été envoyés au modèle\./,
    );
    await m.unmount();
  });
});

describe("MessageNotices — the documents the model no longer sees are named on the turn", () => {
  it("names them, and says nothing on a turn that dropped none", async () => {
    const msg = { id: "a1", role: "assistant", content: "ok" } as Message;
    const m = await mount(<MessageNotices message={{ ...msg, droppedDocs: ["contrat.pdf", "annexe.docx"] }} />);
    expect(m.el.textContent).toContain("contrat.pdf et annexe.docx ne sont plus visibles par le modèle");
    await m.rerender(<MessageNotices message={msg} />);
    expect(m.el.textContent).not.toContain("visible");
    await m.unmount();
  });
});
