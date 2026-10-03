import { describe, expect, it } from "vitest";
import { getMessages } from "@openmasq/i18n";
import type { Attachment } from "./Composer";
import { checkSubmit } from "./submitGuard";

const t = getMessages("fr");
const file = (over: Partial<Attachment> = {}): Attachment => ({
  name: "bail.pdf",
  kind: "document",
  text: "Bail commercial",
  chars: 15,
  redactPreview: 0,
  cid: over.name ?? "bail.pdf",
  ...over,
});

describe("checkSubmit — no staged file is ever dropped silently", () => {
  it("a file still being READ (or queued) refuses the send, like a masking", () => {
    const reading = file({ name: "scan.pdf", text: "", extracting: true });
    expect(checkSubmit({ text: "résume", attachments: [file(), reading], t })).toEqual({
      kind: "refuse",
      warning: t.runtime.send.fileStillReading,
    });
    const queued = file({ name: "b.pdf", text: "", extracting: true, extractQueued: 2 });
    expect(checkSubmit({ text: "", attachments: [queued], t }).kind).toBe("refuse");
    expect(checkSubmit({ text: "x", attachments: [file({ redacting: true })], t })).toEqual({
      kind: "refuse",
      warning: t.runtime.send.fileStillMasking,
    });
  });

  it("files that could not be read are NAMED for confirmation", () => {
    const a = file({ name: "a.pdf", text: "", error: "Lecture impossible" });
    const b = file({ name: "b.pdf", text: "  " });
    expect(checkSubmit({ text: "compare", attachments: [file(), a, b], t })).toEqual({
      kind: "confirm",
      unread: ["a.pdf", "b.pdf"],
    });
    expect(t.runtime.send.unreadBody(2, "a.pdf, b.pdf")).toBe(
      "2 fichiers n'ont pas pu être lus et ne seront pas envoyés : a.pdf, b.pdf",
    );
  });

  it("once those exact files are accepted the send proceeds; a NEW unreadable file asks again", () => {
    const a = file({ name: "a.pdf", text: "" });
    expect(checkSubmit({ text: "go", attachments: [a], t, accepted: ["a.pdf"] })).toEqual({ kind: "send" });
    const c = file({ name: "c.pdf", text: "" });
    expect(checkSubmit({ text: "go", attachments: [a, c], t, accepted: ["a.pdf"] })).toEqual({
      kind: "confirm",
      unread: ["a.pdf", "c.pdf"],
    });
  });

  it("an image the send carries as a PICTURE is not lost, even without OCR text", () => {
    const photo = file({ name: "photo.png", kind: "image", text: "", error: "OCR impossible" });
    expect(checkSubmit({ text: "décris", attachments: [photo], t, imageNames: ["photo.png"] })).toEqual({
      kind: "send",
    });
    // Without the picture route, its text was the only thing to send: it is named.
    expect(checkSubmit({ text: "décris", attachments: [photo], t })).toEqual({ kind: "confirm", unread: ["photo.png"] });
  });

  it("nothing but unreadable files: refused, never an empty message", () => {
    const a = file({ name: "a.pdf", text: "" });
    const r = checkSubmit({ text: "  ", attachments: [a], t, accepted: ["a.pdf"] });
    expect(r).toEqual({ kind: "refuse", warning: t.runtime.send.unreadNothingLeft(1, "a.pdf") });
    expect(checkSubmit({ text: "", attachments: [], t })).toEqual({ kind: "idle" });
  });

  it("readable files only: sends", () => {
    expect(checkSubmit({ text: "", attachments: [file()], t })).toEqual({ kind: "send" });
  });
});

describe("checkSubmit — a message too big for the model is refused BEFORE masking", () => {
  // gpt-4o: a 128K window. chars/4 ⇒ 4 characters per estimated token.
  const big = (tokens: number) => "a".repeat(tokens * 4);

  it("refuses, naming the size and the limit, and suggests a larger model or fewer files", () => {
    const doc = file({ name: "dossier.pdf", text: big(200_000) });
    const r = checkSubmit({ text: "résume", attachments: [doc], t, modelId: "gpt-4o" });
    expect(r).toEqual({ kind: "refuse", warning: t.runtime.send.contextTooLarge("GPT-4o", "200K", "128K", true) });
    if (r.kind === "refuse") {
      expect(r.warning).toContain("Rien n'a été envoyé");
      expect(r.warning).toContain("moins de fichiers");
    }
  });

  it("the typed text alone counts too — and then the advice is to shorten it", () => {
    const r = checkSubmit({ text: big(200_000), attachments: [], t, modelId: "gpt-4o" });
    expect(r.kind === "refuse" && r.warning).toContain("raccourcissez le texte");
  });

  it("never refuses near the limit: the estimate is rough, the provider stays the backstop", () => {
    expect(checkSubmit({ text: big(150_000), attachments: [], t, modelId: "gpt-4o" })).toEqual({ kind: "send" });
  });

  it("never refuses for Auto, an unknown window, or a model with room", () => {
    const doc = file({ text: big(200_000) });
    expect(checkSubmit({ text: "go", attachments: [doc], t, modelId: "auto" })).toEqual({ kind: "send" });
    expect(checkSubmit({ text: "go", attachments: [doc], t, modelId: "llama3:local" })).toEqual({ kind: "send" });
    expect(checkSubmit({ text: "go", attachments: [doc], t, modelId: "gpt-4.1" })).toEqual({ kind: "send" });
    expect(checkSubmit({ text: "go", attachments: [doc], t })).toEqual({ kind: "send" });
  });

  it("a file without text (unread) adds nothing to the estimate", () => {
    const empty = file({ name: "scan.pdf", text: "" });
    expect(checkSubmit({ text: "go", attachments: [empty], t, modelId: "gpt-4o", accepted: ["scan.pdf"] })).toEqual({ kind: "send" });
  });
});
