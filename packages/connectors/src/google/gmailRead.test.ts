import { describe, expect, it } from "vitest";
import { gmailConnector } from "./gmailRead";
import type { ConnectorToolCtx } from "../types";

/**
 * La LECTURE Gmail — le trou rapporté en usage réel : « le connecteur me donne
 * l'expéditeur, l'objet et la date, mais pas le contenu ». Les listes doivent porter
 * l'[id] (sinon `get_message` n'a pas de cible), et `get_message` doit extraire le
 * corps TEXTE d'une charge MIME réelle (multipart, base64url, repli HTML).
 */

const tool = (name: string) => gmailConnector.tools.find((t) => t.name === name)!;
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function ctxWith(routes: Record<string, unknown>): ConnectorToolCtx {
  return {
    accessToken: "tok",
    fetchText: async () => "",
    fetchJson: async (url: string) => {
      const hit = Object.entries(routes).find(([k]) => url.includes(k));
      if (!hit) throw new Error(`unexpected url: ${url}`);
      return hit[1] as never;
    },
  };
}

describe("gmail — les listes portent l'id, get_message lit le corps", () => {
  it("search_messages : chaque ligne porte [id: …] — la cible de get_message", async () => {
    const ctx = ctxWith({
      "/messages?q=": { messages: [{ id: "a1" }] },
      "/messages/a1?format=metadata": {
        id: "a1",
        payload: { headers: [
          { name: "From", value: "alice@example.com" },
          { name: "Subject", value: "Facture" },
          { name: "Date", value: "Wed, 30 Jul 2026" },
        ] },
      },
    });
    const res = await tool("search_messages").run({ query: "from:alice" }, ctx);
    expect(res.content[0].text).toContain("[id: a1]");
    expect(res.content[0].text).toContain("Facture");
  });

  it("get_message : multipart réel → le text/plain décodé (base64url, accents compris)", async () => {
    const ctx = ctxWith({
      "/messages/a1?format=full": {
        id: "a1",
        payload: {
          headers: [
            { name: "From", value: "alice@example.com" },
            { name: "Subject", value: "Réunion" },
            { name: "Date", value: "Wed, 30 Jul 2026" },
          ],
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64url("Bonjour — l'été arrive, RDV à 14h.") } },
            { mimeType: "text/html", body: { data: b64url("<p>Bonjour</p>") } },
          ],
        },
      },
    });
    const res = await tool("get_message").run({ id: "a1" }, ctx);
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain("Objet : Réunion");
    expect(res.content[0].text).toContain("l'été arrive, RDV à 14h");
  });

  it("get_message : sans text/plain, repli sur le HTML débalisé", async () => {
    const ctx = ctxWith({
      "/messages/h1?format=full": {
        id: "h1",
        payload: {
          headers: [{ name: "Subject", value: "Newsletter" }],
          mimeType: "text/html",
          body: { data: b64url("<style>p{color:red}</style><p>Offre <b>spéciale</b> du jour</p>") },
        },
      },
    });
    const res = await tool("get_message").run({ id: "h1" }, ctx);
    expect(res.content[0].text).toContain("Offre spéciale du jour");
    expect(res.content[0].text).not.toContain("<p>");
    expect(res.content[0].text).not.toContain("color:red");
  });

  it("get_message exige un id (pas d'appel Gmail à l'aveugle)", async () => {
    const res = await tool("get_message").run({}, ctxWith({}));
    expect(res.isError).toBe(true);
  });

  it("le connecteur offre les QUATRE outils, lecture taguée gmail.readonly", () => {
    expect(gmailConnector.tools.map((t) => t.name).sort()).toEqual(
      ["get_message", "list_recent", "search_messages", "send_email"].sort(),
    );
    expect(tool("get_message").scope).toBe("https://www.googleapis.com/auth/gmail.readonly");
    // managed ≡ byo (30/07/2026) : la lecture est offerte en 1-clic aussi.
    expect(gmailConnector.scopes.managed).toContain("https://www.googleapis.com/auth/gmail.readonly");
  });
});
