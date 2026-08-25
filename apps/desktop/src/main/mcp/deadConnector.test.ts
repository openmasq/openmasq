import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RÉGRESSION — un serveur MCP mort était SIGNALÉ à chaque sondage, jamais retiré.
 *
 * `refreshRoutes` attrapait l'échec de `listTools`, posait le compteur d'outils à 0,
 * appelait `reportMainError`… et laissait le serveur dans `connected`. Le rafraîchissement
 * suivant le re-sondait donc, et le re-signalait. Mesuré sur Sentry le 12/08 : **848
 * événements « Error: Not connected » en huit jours pour UN enfant `@playwright/mcp`
 * disparu**, plus 481 sur une autre build — 93 % du volume du projet pour deux messages.
 *
 * Ce que ces cas épinglent, et qu'un commentaire ne peut pas tenir :
 *  • un transport MORT évince, et n'est pas rapporté (la bannière « reconnexion
 *    nécessaire » est la surface qui le dit à l'utilisateur) ;
 *  • une VRAIE panne (spawn ENOENT, module introuvable — la régression d'empaquetage)
 *    est toujours rapportée, et le serveur n'est pas évincé sur ce motif ;
 *  • deux rafraîchissements après une mort ne produisent pas deux rapports.
 */

const { reports } = vi.hoisted(() => ({ reports: [] as { scope: string; code: string }[] }));

// ⚠️ Les chemins de `vi.mock` se résolvent depuis CE fichier, pas depuis le module qui
// importe : `registry.ts` vit dans `server/`, donc son `../../runtime/errorReport` s'écrit
// `../runtime/errorReport` d'ici.
vi.mock("electron", () => ({ app: { getPath: () => "/tmp", getVersion: () => "0" }, BrowserWindow: class {} }));
vi.mock("./persist", () => ({ getServer: () => undefined }));
vi.mock("../runtime/errorReport", () => ({
  reportMainError: (scope: string, code: string) => {
    reports.push({ scope, code });
  },
}));
vi.mock("./browserTools", () => ({ BROWSER_TOOL_ALLOWLIST: new Set<string>() }));

import { connected, needsReconnect, refreshRoutes, toolCounts } from "./server/registry";

/** Un serveur dont `listTools` échoue toujours de la même façon. */
function failing(id: string, err: unknown) {
  const closed = { n: 0 };
  connected.set(id, {
    id,
    listTools: () => Promise.reject(err),
    callTool: () => Promise.reject(new Error("unused")),
    close: () => {
      closed.n += 1;
      return Promise.resolve();
    },
  } as never);
  return closed;
}

describe("refreshRoutes — un connecteur mort est évincé, pas re-signalé", () => {
  beforeEach(() => {
    connected.clear();
    toolCounts.clear();
    needsReconnect.clear();
    reports.length = 0;
  });

  it("évince sur « Not connected » sans rien rapporter, et le ferme", async () => {
    const closed = failing("pw", new Error("Not connected"));
    await refreshRoutes();
    expect(connected.has("pw")).toBe(false);
    expect(reports).toEqual([]);
    // Fermé au passage : l'enfant peut être mort côté transport sans que le client SDK
    // ait relâché ses ressources.
    expect(closed.n).toBe(1);
    // Et l'utilisateur l'apprend — c'est ce qui rend le silence de Sentry acceptable.
    expect(needsReconnect.has("pw")).toBe(true);
  });

  it("évince aussi sur le second texte du SDK (« Connection closed »)", async () => {
    failing("notion", new Error("MCP error -32000: Connection closed"));
    await refreshRoutes();
    expect(connected.has("notion")).toBe(false);
    expect(reports).toEqual([]);
  });

  it("deux rafraîchissements après une mort = ZÉRO rapport (c'était 848)", async () => {
    failing("pw", new Error("Not connected"));
    await refreshRoutes();
    await refreshRoutes();
    expect(reports).toEqual([]);
    expect(connected.size).toBe(0);
  });

  it("une VRAIE panne est rapportée, et le serveur reste — le signal d'empaquetage survit", async () => {
    failing("fs", new Error("spawn npx ENOENT"));
    await refreshRoutes();
    expect(reports).toEqual([{ scope: "mcp", code: "list-tools" }]);
    // Pas évincé : ce n'est pas un transport mort, c'est un serveur qui n'a jamais démarré
    // correctement — le retirer effacerait la trace au lieu de la montrer.
    expect(connected.has("fs")).toBe(true);
    expect(toolCounts.get("fs")).toBe(0);
  });

  it("un serveur SAIN n'est ni évincé ni rapporté, et ses outils sont routés", async () => {
    connected.set("ok", {
      id: "ok",
      listTools: () => Promise.resolve([{ name: "ping" }]),
      callTool: () => Promise.resolve({}),
      close: () => Promise.resolve(),
    } as never);
    const tools = await refreshRoutes();
    expect(tools.map((t) => t.name)).toEqual(["ok__ping"]);
    expect(connected.has("ok")).toBe(true);
    expect(reports).toEqual([]);
  });
});
