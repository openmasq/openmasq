import { describe, expect, it, vi, afterEach } from "vitest";
import type { Connector } from "@openmasq/connectors";
import { makeConnectorConnection } from "./run";

// The SSRF floor resolves DNS; the URLs below are real provider hosts, but a unit test
// must not depend on the network.
vi.mock("../../net/net", () => ({ assertPublicUrl: async () => {} }));

/** A connector whose one tool always hits the (stubbed) provider. */
function conn(errorHint?: (err: unknown) => string): Connector {
  return {
    id: "google-calendar",
    name: "Google Agenda",
    auth: "pkce",
    scopes: { managed: [], byo: [] },
    tools: [
      {
        name: "list_events",
        description: "",
        inputSchema: { type: "object", properties: {} },
        async run(_args, ctx) {
          const r = await ctx.fetchJson<{ ok: boolean }>(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          );
          return { content: [{ type: "text", text: JSON.stringify(r) }] };
        },
      },
    ],
    ...(errorHint ? { errorHint } : {}),
  };
}

function stubFetch(status: number, body: string) {
  vi.stubGlobal("fetch", async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  }));
}

const call = () => ({ id: "1", name: "list_events", arguments: {} });

/** Un connecteur dont l'outil IGNORE le retour — la forme d'une ÉCRITURE (`sendMail`). */
function writeConn(): Connector {
  return {
    id: "microsoft-outlook",
    name: "Outlook",
    auth: "microsoft",
    scopes: { managed: [], byo: [] },
    tools: [
      {
        name: "send_email",
        description: "",
        inputSchema: { type: "object", properties: {} },
        async run(_args, ctx) {
          await ctx.fetchJson("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST" });
          return { content: [{ type: "text", text: "Email envoyé." }] };
        },
      },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

/**
 * ⛔ La régression du 18/08 (Outlook). Graph répond `202 Accepted` SANS corps à
 * `POST /me/sendMail` : `res.json()` jetait « Unexpected end of JSON input », l'outil
 * remontait en ÉCHEC alors que le mail était PARTI, le modèle a relancé le même appel
 * — donc un second mail — puis a annoncé que l'envoi n'avait pas pu se faire. Un effet
 * de bord réel présenté comme une panne est pire qu'une panne : il se répète.
 */
describe("bearerFetchJson — un corps vide est un succès vide", () => {
  const send = () => ({ id: "1", name: "send_email", arguments: {} });

  it("202 sans corps (Graph sendMail) RÉUSSIT", async () => {
    stubFetch(202, "");
    const c = makeConnectorConnection({
      id: "microsoft-outlook",
      connector: writeConn(),
      getToken: async () => "tok",
      grantedScopes: [],
    });
    const res = await c.callTool(send());
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as { text: string }).text).toContain("Email envoyé");
  });

  it("204 et un corps d'espaces réussissent aussi", async () => {
    for (const [status, body] of [[204, ""], [200, "   \n"]] as const) {
      stubFetch(status, body);
      const c = makeConnectorConnection({
        id: "microsoft-outlook",
        connector: writeConn(),
        getToken: async () => "tok",
        grantedScopes: [],
      });
      expect((await c.callTool(send())).isError).toBeFalsy();
    }
  });

  it("un 2xx au corps ILLISIBLE reste une erreur, mais NOMMÉE", async () => {
    // Un `SyntaxError` nu ne se relie à rien ; celle-ci dit que l'appel a abouti.
    stubFetch(200, "<html>oops</html>");
    const c = makeConnectorConnection({
      id: "microsoft-outlook",
      connector: writeConn(),
      getToken: async () => "tok",
      grantedScopes: [],
    });
    const res = await c.callTool(send());
    expect(res.isError).toBe(true);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain("Réponse illisible");
    expect(text).not.toContain("Unexpected end of JSON input");
  });

  it("un corps JSON normal est toujours rendu tel quel", async () => {
    stubFetch(200, JSON.stringify({ ok: true }));
    const c = makeConnectorConnection({
      id: "google-calendar",
      connector: conn(),
      getToken: async () => "tok",
      grantedScopes: [],
    });
    const res = await c.callTool(call());
    expect((res.content[0] as { text: string }).text).toContain('"ok":true');
  });
});

describe("makeConnectorConnection — a failure the user can act on", () => {
  // Google's 401 body, as it really comes back.
  const BODY_401 = JSON.stringify({
    error: { code: 401, message: "Invalid Credentials", status: "UNAUTHENTICATED" },
  });

  it("applies the CONNECTOR's hint, so a tool added later cannot forget it", async () => {
    // The reported failure: Agenda/Drive/Docs/Sheets/Tasks/Analytics never called
    // `googleApiErrorHint` — only Gmail did, by hand, in each tool. Everyone else
    // surfaced a bare « Upstream request failed (401) », which names no action.
    stubFetch(401, BODY_401);
    const c = makeConnectorConnection({
      id: "google-calendar",
      connector: conn((err) => `Jeton expiré — reconnectez Google Agenda. (${String(err)})`),
      getToken: async () => "tok",
      grantedScopes: [],
    });
    const res = await c.callTool(call());
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("reconnectez Google Agenda");
  });

  it("un 401 SANS indice du connecteur dit quand même quoi faire, et à qui", async () => {
    // ⛔ La régression du 15/08 (GitHub) : sans indice déclaré, un jeton refusé sortait en
    // « Upstream request failed (401) ». Le modèle ne pouvait que le répéter, la connexion
    // restait affichée comme valide, et « Réessayer » relançait un tour perdu d'avance.
    stubFetch(401, BODY_401);
    const c = makeConnectorConnection({
      id: "google-calendar",
      connector: conn(),
      getToken: async () => "tok",
      grantedScopes: [],
    });
    const text = (await c.callTool(call())).content[0] as { text: string };
    expect(text.text).toContain("Google Agenda"); // QUI
    expect(text.text).toMatch(/reconnecter/i); // QUOI FAIRE
    expect(text.text).toMatch(/Réglages → Connecteurs/); // OÙ
    expect(text.text).toMatch(/pas en boucle/i); // et l'ordre de ne pas boucler
  });

  it("les autres statuts gardent le message normalisé", async () => {
    // Un 500 est une panne passagère : « réessayez » y est vrai, contrairement au 401.
    stubFetch(500, JSON.stringify({ error: { code: 500, message: "boom" } }));
    const c = makeConnectorConnection({
      id: "google-calendar",
      connector: conn(),
      getToken: async () => "tok",
      grantedScopes: [],
    });
    const text = (await c.callTool(call())).content[0] as { text: string };
    expect(text.text).toContain("Upstream request failed (500)");
    expect(text.text).not.toMatch(/reconnecter/i);
  });

  it("keeps the provider's explanation in `detail` — and OUT of what the model reads", async () => {
    // `content` is the only thing handed to the model, so free upstream text (a
    // prompt-injection surface, and possibly a real value) must never land there.
    // Without `detail` anywhere, a 400 was simply unexplainable: the app blamed the
    // model, the model blamed the connection, and neither could be checked.
    stubFetch(
      400,
      JSON.stringify({
        error: { code: 400, message: "Missing required parameter: timeMin", status: "INVALID_ARGUMENT" },
      }),
    );
    const c = makeConnectorConnection({
      id: "google-calendar",
      connector: conn(() => "Lecture de l'agenda impossible."),
      getToken: async () => "tok",
      grantedScopes: [],
    });
    const res = await c.callTool(call());
    expect(res.detail).toBe("Missing required parameter: timeMin");
    expect(JSON.stringify(res.content)).not.toContain("Missing required parameter");
  });

  it("carries no `detail` when the failure never reached the provider", async () => {
    const c = makeConnectorConnection({
      id: "google-calendar",
      connector: conn(),
      getToken: async () => {
        throw new Error("no token");
      },
      grantedScopes: [],
    });
    const res = await c.callTool(call());
    expect(res.isError).toBe(true);
    expect(res.detail).toBeUndefined();
  });
});
