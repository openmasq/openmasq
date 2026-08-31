import { afterEach, describe, expect, it } from "vitest";
import { startToolsBridge, type ToolsBridge } from "./toolsBridge";

const CATALOG = [
  { name: "recherche", description: "Cherche.", parameters: { type: "object" } },
  { name: "gmail__send", description: "Envoie.", parameters: { type: "object" } },
];

let bridge: ToolsBridge | null = null;
afterEach(() => {
  bridge?.close();
  bridge = null;
});

const rpc = (b: ToolsBridge, body: unknown, token = b.token) =>
  fetch(b.url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("toolsBridge — la frontière du pont (règle 7)", () => {
  it("FAIL-CLOSED : sans jeton exact, 401 avant toute lecture — un port loopback est public en local", async () => {
    bridge = await startToolsBridge(CATALOG);
    for (const t of ["", "mauvais", bridge.token.slice(1)]) {
      const r = await rpc(bridge, { jsonrpc: "2.0", id: 1, method: "tools/list" }, t);
      expect(r.status).toBe(401);
    }
  });

  it("tools/list sert exactement le catalogue du tour, schéma sous `inputSchema`", async () => {
    bridge = await startToolsBridge(CATALOG);
    const r = await rpc(bridge, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    const body = await r.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "recherche",
      "gmail__send",
    ]);
    expect(body.result.tools[0].inputSchema).toEqual({ type: "object" });
  });

  it("tools/call CAPTURE (nom + args parsés) et PARQUE la réponse — jamais d'exécution ici", async () => {
    bridge = await startToolsBridge(CATALOG);
    let answered = false;
    void rpc(bridge, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "recherche", arguments: { q: "valeur-redacted" } },
    }).then(() => (answered = true), () => {});
    const call = await bridge.nextCall();
    expect(call).toEqual({ name: "recherche", arguments: { q: "valeur-redacted" } });
    expect(answered).toBe(false); // parked: the turn kills the CLI, close() will destroy the socket
  });

  it("un outil HORS catalogue est refusé en erreur JSON-RPC, jamais capturé", async () => {
    bridge = await startToolsBridge(CATALOG);
    const r = await rpc(bridge, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "Bash", arguments: {} },
    });
    const body = await r.json();
    expect(body.error.message).toContain("Bash");
    // nextCall must NOT have resolved on this refusal.
    const raced = await Promise.race([bridge.nextCall(), Promise.resolve("rien")]);
    expect(raced).toBe("rien");
  });

  it("une méthode inconnue portant un id reçoit un résultat vide (mesuré : `server/discover`)", async () => {
    bridge = await startToolsBridge(CATALOG);
    const r = await rpc(bridge, { jsonrpc: "2.0", id: 4, method: "server/discover" });
    expect((await r.json()).result).toEqual({});
  });
});
