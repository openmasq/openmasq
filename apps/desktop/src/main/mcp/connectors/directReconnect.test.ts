import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RÉGRESSION — un connecteur DIRECT dont le fournisseur refuse le jeton (401) restait
 * affiché vert, et le bandeau « reconnexion nécessaire » ne se levait jamais.
 *
 * Le signal existait, mais il venait du TRANSPORT : un connecteur distant qui tombe fait
 * fermer sa socket, ce qui marque `needsReconnect`. Un connecteur direct tourne EN
 * PROCESSUS — rien ne tombe, donc rien ne signalait. L'utilisateur ne voyait qu'un outil
 * qui échoue (constaté le 15/08 sur GitHub : jeton de device flow révoqué), et le modèle
 * ne pouvait que répéter l'échec.
 *
 * Deux moitiés, et la seconde compte autant : le 401 LÈVE le drapeau, un appel qui passe
 * le BAISSE. Sans ça le bandeau resterait allumé après une reconnexion réussie, puisque le
 * connecteur direct ne repasse pas par le chemin de reconnexion du transport distant.
 */

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp", getVersion: () => "0" },
  BrowserWindow: class {},
}));
vi.mock("../server/persist", () => ({ getServer: () => ({ id: "github", name: "GitHub" }) }));
vi.mock("../../runtime/errorReport", () => ({ reportMainError: () => {} }));
vi.mock("../server/browserTools", () => ({ BROWSER_TOOL_ALLOWLIST: new Set<string>() }));
// Le plancher SSRF n'est pas le sujet ici — et il ferait une VRAIE résolution DNS.
vi.mock("../../net/net", () => ({ assertPublicUrl: () => Promise.resolve() }));

import { makeConnectorConnection } from "./run";
import { emitNeedsReconnect, needsReconnect } from "../server/registry";

/** Un connecteur direct à un seul outil, qui appelle l'API du fournisseur. */
function github() {
  return makeConnectorConnection({
    id: "github",
    connector: {
      id: "github",
      name: "GitHub",
      tools: [
        {
          name: "list_prs",
          description: "Liste les PR",
          inputSchema: { type: "object" },
          run: (_args: unknown, ctx: { fetchJson: (u: string) => Promise<unknown> }) =>
            ctx.fetchJson("https://api.github.com/pulls") as Promise<never>,
        },
      ],
    } as never,
    getToken: () => Promise.resolve("jeton"),
    grantedScopes: [],
  });
}

const respond = (status: number) =>
  vi.stubGlobal("fetch", () =>
    Promise.resolve({
      ok: status < 400,
      status,
      text: () => Promise.resolve("{}"),
      json: () => Promise.resolve({ ok: true }),
    }),
  );

describe("connecteur DIRECT — le 401 lève le bandeau de reconnexion", () => {
  beforeEach(() => {
    needsReconnect.clear();
    emitNeedsReconnect();
  });

  it("un 401 marque le connecteur, et l'outil rend une erreur actionnable", async () => {
    respond(401);
    const res = await github().callTool({ name: "list_prs", arguments: {} });
    expect(needsReconnect.has("github")).toBe(true);
    expect(res.isError).toBe(true);
    // Le message reste celui qui dit QUOI FAIRE — le drapeau ne le remplace pas.
    expect(JSON.stringify(res.content)).toContain("Réglages → Connecteurs");
  });

  it("un appel qui PASSE le baisse — sinon le bandeau survivrait à la reconnexion", async () => {
    respond(401);
    await github().callTool({ name: "list_prs", arguments: {} });
    expect(needsReconnect.has("github")).toBe(true);
    respond(200);
    await github().callTool({ name: "list_prs", arguments: {} });
    expect(needsReconnect.has("github")).toBe(false);
  });

  it("⚠️ un 403 ne le lève PAS — c'est un droit manquant, pas un jeton mort", async () => {
    // Envoyer l'utilisateur reconnecter pour un scope absent lui fait refaire un tour qui
    // ne corrige rien.
    respond(403);
    const res = await github().callTool({ name: "list_prs", arguments: {} });
    expect(res.isError).toBe(true);
    expect(needsReconnect.has("github")).toBe(false);
  });
});
