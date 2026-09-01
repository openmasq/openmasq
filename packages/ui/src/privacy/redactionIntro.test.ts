import { describe, expect, it } from "vitest";
import { shouldShowRedactionIntro } from "./redactionIntro";
import type { Conversation, Message } from "../types";

/**
 * The "Comprendre mon redaction" container: under the first replies, until
 * "Fermer pour toujours". Two possible mistakes, both costly: coming back after
 * it was closed (the noise that teaches people to ignore it), or showing before a reply
 * exists (it then "explains" a redaction that nothing illustrates).
 */
const msg = (over: Partial<Message>): Message =>
  ({ id: Math.random().toString(36).slice(2), role: "user", content: "x", ...over }) as Message;

const conv = (messages: Message[]): Conversation => ({ messages }) as Conversation;

describe("shouldShowRedactionIntro", () => {
  it("se montre après la première réponse ARRIVÉE — y compris sans rien de redacted", () => {
    // THE case the transparency card never covers: a conversation with no
    // personal data. That is exactly where "why is nothing masked?" gets
    // asked, so the container does NOT depend on the coffre.
    const c = conv([msg({}), msg({ role: "assistant" })]);
    expect(shouldShowRedactionIntro(c, false)).toBe(true);
    expect(shouldShowRedactionIntro(c, undefined)).toBe(true);
  });

  it("« Fermer pour toujours » veut dire TOUJOURS — plus jamais, aucune conversation", () => {
    const c = conv([msg({}), msg({ role: "assistant" })]);
    expect(shouldShowRedactionIntro(c, true)).toBe(false);
  });

  it("jamais avant une réponse arrivée : pendant l'attente, il n'explique rien", () => {
    expect(shouldShowRedactionIntro(conv([msg({})]), false)).toBe(false);
    expect(shouldShowRedactionIntro(conv([msg({}), msg({ role: "assistant", pending: true })]), false)).toBe(false);
    expect(shouldShowRedactionIntro(conv([]), false)).toBe(false);
    expect(shouldShowRedactionIntro(null, false)).toBe(false);
  });
});
