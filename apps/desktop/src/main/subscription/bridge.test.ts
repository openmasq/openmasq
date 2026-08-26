// Le pont stateless→stateful. Le cas qui justifie le fichier : `--input-format
// stream-json` rejoue chaque message user comme un tour facturé (mesuré), donc
// l'historique DOIT être aplati, pas réinjecté.
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@openmasq/llm";
import { flattenForCli, hasUnsupportedAttachments } from "./bridge";

const msg = (role: ChatMessage["role"], content: string): ChatMessage => ({ role, content });

describe("flattenForCli", () => {
  it("envoie un premier message NU — pas d'étiquette qui ferait dériver le ton", () => {
    expect(flattenForCli([msg("user", "Bonjour")])).toEqual({
      system: undefined,
      prompt: "Bonjour",
    });
  });

  it("sort les messages system dans leur propre champ", () => {
    const out = flattenForCli([msg("system", "Tu es concis."), msg("user", "Salut")]);
    expect(out.system).toBe("Tu es concis.");
    expect(out.prompt).toBe("Salut");
  });

  it("joint plusieurs messages system", () => {
    const out = flattenForCli([
      msg("system", "Règle A."),
      msg("system", "Règle B."),
      msg("user", "ok"),
    ]);
    expect(out.system).toBe("Règle A.\n\nRègle B.");
  });

  it("étiquette les rôles dès qu'il y a un historique", () => {
    const out = flattenForCli([
      msg("user", "Mon code est BANANE42."),
      msg("assistant", "Noté."),
      msg("user", "Répète-le."),
    ]);
    expect(out.prompt).toBe(
      "Utilisateur :\nMon code est BANANE42.\n\nAssistant :\nNoté.\n\nUtilisateur :\nRépète-le.",
    );
  });

  it("rend un prompt vide quand il n'y a rien à envoyer", () => {
    expect(flattenForCli([msg("system", "Tu es concis.")]).prompt).toBe("");
  });
});

describe("hasUnsupportedAttachments", () => {
  it("repère une pièce jointe — la CLI headless ne prend que du texte", () => {
    const withImage: ChatMessage = {
      role: "user",
      content: "Regarde",
      attachments: [{ kind: "image", mediaType: "image/png", dataBase64: "AA" }],
    };
    expect(hasUnsupportedAttachments([withImage])).toBe(true);
    expect(hasUnsupportedAttachments([msg("user", "Regarde")])).toBe(false);
  });
});
