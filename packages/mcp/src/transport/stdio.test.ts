import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * RÉGRESSION — la moitié STDIO n'avait pas de `onClose`.
 *
 * Le distant (`http.ts`) signalait depuis longtemps la mort inattendue de son transport,
 * et le propriétaire évinçait le connecteur. `connectStdio` n'avait pas ce crochet : un
 * enfant qui meurt restait « connecté » pour toujours, et l'appelant continuait de lui
 * parler. C'est ce qui a produit 848 « Error: Not connected » sur Sentry en huit jours
 * pour un seul `@playwright/mcp` disparu (l'enfant stdio du navigateur agent).
 *
 * Le contrat en deux temps, ici épinglé : une mort INATTENDUE prévient, une fermeture
 * VOULUE se tait — sinon `close()` déclencherait la reconnexion qu'on vient d'annuler.
 */

const h = vi.hoisted(() => {
  class FakeTransport {
    constructor(public opts: unknown) {}
    async start() {}
    async close() {}
  }
  class FakeClient {
    onclose?: () => void;
    closed = 0;
    constructor(public info: unknown) {
      h.clients.push(this as never);
    }
    async connect(_t: FakeTransport) {}
    async close() {
      this.closed += 1;
      // Le SDK notifie la fermeture du transport, la nôtre comprise : c'est
      // exactement pourquoi le drapeau `closing` existe.
      this.onclose?.();
    }
  }
  return { FakeTransport, FakeClient, clients: [] as { onclose?: () => void; close: () => Promise<void> }[] };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({ Client: h.FakeClient }));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({ StdioClientTransport: h.FakeTransport }));

import { connectStdio } from "./stdio";

describe("connectStdio — la mort de l'enfant se signale", () => {
  beforeEach(() => {
    h.clients.length = 0;
  });

  it("appelle `onClose` avec l'id quand le transport tombe tout seul", async () => {
    const closed: string[] = [];
    await connectStdio({ id: "pw", command: "node", onClose: (id) => closed.push(id) });
    // Le SDK signale la chute (l'enfant est sorti / a planté).
    h.clients[0].onclose?.();
    expect(closed).toEqual(["pw"]);
  });

  it("NE l'appelle PAS pour notre propre `close()` — une fermeture voulue n'est pas une panne", async () => {
    const closed: string[] = [];
    const conn = await connectStdio({ id: "fs", command: "node", onClose: (id) => closed.push(id) });
    await conn.close();
    expect(closed).toEqual([]);
  });

  it("le crochet est posé AVANT `connect` — un enfant mort-né compte aussi", async () => {
    // Si on le posait après, la mort survenue pendant le démarrage passerait inaperçue,
    // et c'est précisément le cas d'un binaire manquant.
    const closed: string[] = [];
    await connectStdio({ id: "x", command: "node", onClose: (id) => closed.push(id) });
    expect(h.clients[0].onclose).toBeTypeOf("function");
    h.clients[0].onclose?.();
    expect(closed).toEqual(["x"]);
  });

  it("sans `onClose`, rien ne casse — le champ est optionnel", async () => {
    await connectStdio({ id: "y", command: "node" });
    expect(() => h.clients[0].onclose?.()).not.toThrow();
  });
});
