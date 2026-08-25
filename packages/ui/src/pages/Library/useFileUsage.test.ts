import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "../../types";
import { conversationSnippet, fileAnchorIn } from "./useFileUsage";

const msg = (over: Partial<Message>): Message => ({
  id: "m1",
  role: "user",
  content: "",
  ...over,
});

const conv = (messages: Message[]): Conversation =>
  ({ id: "c1", title: "t", modelId: "m", createdAt: 1, updatedAt: 1, messages }) as Conversation;

describe("fileAnchorIn", () => {
  it("returns the FIRST message carrying the file as an attachment", () => {
    const c = conv([
      msg({ id: "a", content: "hello" }),
      msg({ id: "b", attachments: [{ name: "comptes.pdf", kind: "pdf" }] }),
      msg({ id: "c", attachments: [{ name: "comptes.pdf", kind: "pdf" }] }),
    ]);
    expect(fileAnchorIn(c, "comptes.pdf")).toBe("b");
  });

  it("matches by exact name — a different attachment is not this file's anchor", () => {
    const c = conv([msg({ id: "a", attachments: [{ name: "autre.pdf", kind: "pdf" }] })]);
    expect(fileAnchorIn(c, "comptes.pdf")).toBeUndefined();
  });

  it("undefined on a conversation with no attachments (caller opens without scrolling)", () => {
    expect(fileAnchorIn(conv([msg({ id: "a", content: "texte" })]), "comptes.pdf")).toBeUndefined();
  });
});

describe("conversationSnippet", () => {
  it("quotes the LAST message with text, collapsed to one line", () => {
    const c = conv([
      msg({ id: "a", content: "premier" }),
      msg({ id: "b", content: "dernier\navec retour" }),
      msg({ id: "c", attachments: [{ name: "f.pdf", kind: "pdf" }] }),
    ]);
    expect(conversationSnippet(c)).toBe("dernier avec retour");
  });
});
