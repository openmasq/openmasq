import { describe, expect, it } from "vitest";
import { shouldShowRedactionIntro } from "./redactionIntro";
import type { Conversation, Message } from "../types";

/**
 * Le conteneur « Comprendre mon redaction » : sous les premières réponses, jusqu'au
 * « Fermer pour toujours ». Deux erreurs possibles, toutes deux coûteuses : revenir après
 * la fermeture (le bruit qui apprend à ignorer), ou se montrer avant qu'une réponse
 * existe (il « explique » alors un redaction que rien n'illustre).
 */
const msg = (over: Partial<Message>): Message =>
  ({ id: Math.random().toString(36).slice(2), role: "user", content: "x", ...over }) as Message;

const conv = (messages: Message[]): Conversation => ({ messages }) as Conversation;

describe("shouldShowRedactionIntro", () => {
  it("se montre après la première réponse ARRIVÉE — y compris sans rien de redacted", () => {
    // LE cas que l'encart de transparence ne couvre jamais : une conversation sans
    // donnée personnelle. C'est précisément là que « pourquoi rien n'est masqué ? » se
    // pose, donc le conteneur ne dépend PAS du coffre.
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
