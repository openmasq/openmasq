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

  // ⚠️ `modelContent` porte les documents dépliés, donc ce qui est VRAIMENT parti. Le
  // comparatif doit montrer ça, pas la bulle affichée.
  it("préfère `modelContent` au contenu affiché", () => {
    const c = conv({
      redactionVault: VAULT,
      messages: [msg({ content: "Vois la pièce jointe.", modelContent: "Vois : Marie Rebour" })],
    });
    expect(transparencyPairs(c)[0].wire).toContain("Chloé Cros");
  });

  // Un couple identique des deux côtés n'apprend rien et dilue ceux qui comptent — c'est
  // aussi ce qui rend l'encart honnête : s'il annonce N, les N sont visibles.
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

  // La condition qui le rend supportable : un bandeau de réassurance qui revient à chaque
  // nouveau chat cesse d'être lu au troisième, et devient le bruit dont on se débarrasse.
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

  // Le coffre peut porter des valeurs venues d'AILLEURS (un résultat d'outil), sans
  // qu'aucun message n'en montre : l'encart annoncerait alors N sans rien à ouvrir.
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
