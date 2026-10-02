import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { newConversation } from "../storePersistence";
import { displayTitle } from "./displayTitle";

const fr = getMessages("fr");
const en = getMessages("en");

describe("displayTitle", () => {
  it("shows a conversation's own title as is", () => {
    expect(displayTitle("Contrat Dupont", en)).toBe("Contrat Dupont");
  });

  it("reads an empty title as untitled, in the UI language", () => {
    expect(displayTitle("", en)).toBe("New conversation");
    expect(displayTitle(undefined, fr)).toBe("Nouvelle conversation");
    expect(displayTitle("   ", en)).toBe("New conversation");
  });

  it("reads the French default older builds STORED as untitled too", () => {
    expect(displayTitle("Nouvelle conversation", en)).toBe("New conversation");
  });

  it("a new conversation stores no title, so it follows the language", () => {
    const c = newConversation("gpt-x");
    expect(c.title).toBe("");
    expect(displayTitle(c.title, en)).toBe("New conversation");
  });
});
