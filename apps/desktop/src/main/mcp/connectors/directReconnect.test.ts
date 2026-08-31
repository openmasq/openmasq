import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REGRESSION — a DIRECT connector whose provider refuses the token (401) stayed
 * displayed green, and the « reconnection needed » banner never came up.
 *
 * The signal existed, but it came from the TRANSPORT: a remote connector that drops
 * closes its socket, which flags `needsReconnect`. A direct connector runs IN
 * PROCESS — nothing drops, so nothing signalled. The user only saw a tool
 * that fails (observed on 15/08 on GitHub: a revoked device-flow token), and the model
 * could only repeat the failure.
 *
 * Two halves, and the second counts just as much: the 401 RAISES the flag, a call that
 * succeeds LOWERS it. Without that the banner would stay lit after a successful
 * reconnection, since the direct connector doesn't go through the remote transport's reconnection path.
 */

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp", getVersion: () => "0" },
  BrowserWindow: class {},
}));
vi.mock("../server/persist", () => ({ getServer: () => ({ id: "github", name: "GitHub" }) }));
vi.mock("../../runtime/errorReport", () => ({ reportMainError: () => {} }));
vi.mock("../server/browserTools", () => ({ BROWSER_TOOL_ALLOWLIST: new Set<string>() }));
// The SSRF floor is not the point here — and it would do a REAL DNS resolution.
vi.mock("../../net/net", () => ({ assertPublicUrl: () => Promise.resolve() }));

import { makeConnectorConnection } from "./run";
import { emitNeedsReconnect, needsReconnect } from "../server/registry";

/** A direct connector with a single tool, calling the provider's API. */
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
    // The message stays the one that says WHAT TO DO — the flag doesn't replace it.
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
    // Sending the user to reconnect for a missing scope makes them go through a step that
    // fixes nothing.
    respond(403);
    const res = await github().callTool({ name: "list_prs", arguments: {} });
    expect(res.isError).toBe(true);
    expect(needsReconnect.has("github")).toBe(false);
  });
});
