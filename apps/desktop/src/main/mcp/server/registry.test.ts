import { describe, expect, it, beforeEach, vi } from "vitest";
import type { McpConnection } from "@openmasq/mcp";
import { connected, routes, refreshRoutes } from "./registry";

vi.mock("../persist", () => ({ getServer: () => undefined }));
vi.mock("../../runtime/errorReport", () => ({ reportMainError: () => {} }));

/**
 * LA TABLE DE ROUTAGE N'EST JAMAIS VIDE (journal du 15/08).
 *
 * `refreshRoutes` vidait la table EN TÊTE puis la remplissait derrière un
 * `await listTools()` par serveur. Tout appel d'outil tombant dans cette fenêtre —
 * un aller-retour réseau — ne trouvait pas sa route et mourait sur « Unknown MCP tool »
 * alors que l'outil existait : trois appels parallèles au même outil, deux passés, un
 * tué. Le rafraîchissement construit désormais à côté et bascule d'un coup.
 */

/** Une connexion bouchon dont `listTools` s'ouvre quand on le décide. */
function fakeConn(toolNames: string[], gate?: Promise<void>): McpConnection {
  return {
    listTools: async () => {
      if (gate) await gate;
      return toolNames.map((name) => ({ name, description: "", inputSchema: {} }));
    },
    callTool: async () => ({ content: [] }),
    close: async () => {},
  } as unknown as McpConnection;
}

beforeEach(() => {
  connected.clear();
  routes.clear();
});

describe("refreshRoutes — la table reste lisible PENDANT le rafraîchissement", () => {
  it("une route connue survit à un rafraîchissement lent (le bug « Unknown MCP tool »)", async () => {
    connected.set("posthog", fakeConn(["exec", "execute-sql"]));
    await refreshRoutes();
    expect(routes.has("posthog__exec")).toBe(true);

    // Rafraîchissement suivant, bloqué au milieu — c'est la fenêtre fatale d'avant.
    let ouvre!: () => void;
    const porte = new Promise<void>((r) => (ouvre = r));
    connected.set("posthog", fakeConn(["exec", "execute-sql"], porte));
    const enCours = refreshRoutes();

    await Promise.resolve(); // on est bien DANS la fenêtre : listTools n'a pas rendu
    expect(routes.has("posthog__exec"), "route perdue pendant le refresh").toBe(true);

    ouvre();
    await enCours;
    expect(routes.has("posthog__exec")).toBe(true);
  });

  it("deux rafraîchissements concurrents ne se vident pas mutuellement la table", async () => {
    connected.set("posthog", fakeConn(["exec"]));
    await refreshRoutes();

    let ouvre!: () => void;
    const porte = new Promise<void>((r) => (ouvre = r));
    connected.set("posthog", fakeConn(["exec"], porte));
    const a = refreshRoutes();
    const b = refreshRoutes();
    await Promise.resolve();
    expect(routes.has("posthog__exec")).toBe(true);
    ouvre();
    await Promise.all([a, b]);
    expect(routes.has("posthog__exec")).toBe(true);
  });

  it("un outil RETIRÉ côté serveur disparaît bien après la bascule", async () => {
    connected.set("posthog", fakeConn(["exec", "vieux-outil"]));
    await refreshRoutes();
    expect(routes.has("posthog__vieux-outil")).toBe(true);

    connected.set("posthog", fakeConn(["exec"]));
    await refreshRoutes();
    expect(routes.has("posthog__vieux-outil")).toBe(false);
    expect(routes.has("posthog__exec")).toBe(true);
  });
});
