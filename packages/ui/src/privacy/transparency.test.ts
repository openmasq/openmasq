import { describe, it, expect } from "vitest";
import {
  protectedValueCount,
  shouldShowTransparencyCard,
  transparencyPairs,
} from "./transparency";
import type { Conversation, Message } from "../types";

const msg = (over: Partial<Message>): Message =>
  ({ id: "m1", role: "user", content: "", createdAt: 0, ...over }) as Message;

const conv = (over: Partial<Conversation>): Conversation =>
  ({
    id: "c1",
    title: "",
    modelId: "m",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Conversation;

const VAULT = { "Chloé Cros": "Marie Rebour", "chloe@exemple.fr": "marie@exemple.fr" };

describe("transparencyPairs — ce que le modèle a reçu, redérivé", () => {
  it("remplace les valeurs du coffre par leurs pseudonymes", () => {
    const c = conv({
      redactionVault: VAULT,
      messages: [msg({ content: "Écris à Marie Rebour (marie@exemple.fr)." })],
    });
    const [p] = transparencyPairs(c);
    expect(p.real).toContain("Marie Rebour");
    expect(p.wire).toContain("Chloé Cros");
    expect(p.wire).not.toContain("Marie Rebour");
    expect(p.swapped).toBe(2);
  });

  // ⚠️ `modelContent` carries the unfolded documents, hence what REALLY left. The
  // comparison must show that, not the displayed bubble.
  it("préfère `modelContent` au contenu affiché", () => {
    const c = conv({
      redactionVault: VAULT,
      messages: [msg({ content: "Vois la pièce jointe.", modelContent: "Vois : Marie Rebour" })],
    });
    expect(transparencyPairs(c)[0].wire).toContain("Chloé Cros");
  });

  // A pair identical on both sides teaches nothing and dilutes those that count — it is
  // also what makes the card honest: if it announces N, the N are visible.
  it("écarte les messages où RIEN n'a été remplacé", () => {
    const c = conv({
      redactionVault: VAULT,
      messages: [
        msg({ id: "a", content: "Bonjour, comment ça va ?" }),
        msg({ id: "b", content: "Écris à Marie Rebour." }),
      ],
    });
    expect(transparencyPairs(c).map((p) => p.id)).toEqual(["b"]);
  });

  it("un coffre vide ne produit aucun couple", () => {
    expect(transparencyPairs(conv({ messages: [msg({ content: "salut" })] }))).toEqual([]);
    expect(transparencyPairs(conv({ redactionVault: {}, messages: [msg({ content: "x" })] }))).toEqual([]);
  });

  it("compte les VALEURS distinctes, pas les occurrences", () => {
    // L'utilisateur pense « mon nom, mon e-mail », pas « sept remplacements ».
    expect(protectedValueCount(conv({ redactionVault: VAULT }))).toBe(2);
    expect(protectedValueCount(conv({}))).toBe(0);
  });
});

describe("shouldShowTransparencyCard — une seule fois, et après la première réponse", () => {
  const withReply = conv({
    redactionVault: VAULT,
    messages: [
      msg({ id: "u", content: "Écris à Marie Rebour." }),
      msg({ id: "a", role: "assistant", content: "C'est fait." }),
    ],
  });

  it("s'affiche après la première réponse aboutie", () => {
    expect(shouldShowTransparencyCard(withReply, false)).toBe(true);
    expect(shouldShowTransparencyCard(withReply, undefined)).toBe(true);
  });

  // The condition that makes it bearable: a reassurance banner coming back on every new
  // chat stops being read by the third, and becomes the noise one gets rid of.
  it("ne revient JAMAIS une fois vu", () => {
    expect(shouldShowTransparencyCard(withReply, true)).toBe(false);
  });

  it("attend la réponse : avant elle, « ce que le modèle a vu » ne désigne rien", () => {
    const pending = conv({
      redactionVault: VAULT,
      messages: [
        msg({ id: "u", content: "Écris à Marie Rebour." }),
        msg({ id: "a", role: "assistant", content: "", pending: true }),
      ],
    });
    expect(shouldShowTransparencyCard(pending, false)).toBe(false);
  });

  it("ne s'affiche pas quand il n'y a rien à montrer", () => {
    const nothing = conv({
      messages: [msg({ content: "salut" }), msg({ id: "a", role: "assistant", content: "hello" })],
    });
    expect(shouldShowTransparencyCard(nothing, false)).toBe(false);
    expect(shouldShowTransparencyCard(undefined, false)).toBe(false);
  });

  // The vault can carry values that came from ELSEWHERE (a tool result), with no message
  // showing any: the card would then announce N with nothing to open.
  it("ne s'affiche pas si le coffre est plein mais qu'aucun message ne le montre", () => {
    const toolOnly = conv({
      redactionVault: VAULT,
      messages: [
        msg({ content: "résume ma boîte mail" }),
        msg({ id: "a", role: "assistant", content: "voici" }),
      ],
    });
    expect(shouldShowTransparencyCard(toolOnly, false)).toBe(false);
  });
});
