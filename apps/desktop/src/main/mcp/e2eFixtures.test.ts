import { describe, it, expect } from "vitest";
import {
  e2eConnectorFilter,
  parseFixtureServers,
  makeFixtureConnection,
  maybeRegisterE2eFixtureConnections,
} from "./e2eFixtures";

const FIXTURE = JSON.stringify({
  servers: [
    {
      id: "gmail",
      tools: [
        {
          name: "list_recent",
          description: "Lister les emails récents",
          annotations: { readOnlyHint: true },
          result: "De: camille.vernay@exemple-corp.fr — Objet: Budget Q3",
        },
        { name: "send_email", result: "Message envoyé." },
      ],
    },
  ],
});

describe("e2e fixture MCP connections", () => {
  it("parses a valid fixture file and rejects malformed ones LOUDLY", () => {
    const servers = parseFixtureServers(FIXTURE);
    expect(servers).toHaveLength(1);
    expect(servers[0].tools.map((t) => t.name)).toEqual(["list_recent", "send_email"]);
    // A broken fixture must throw, not silently register zero tools.
    expect(() => parseFixtureServers("{}")).toThrow(/servers/);
    expect(() => parseFixtureServers('{"servers":[{"id":"x"}]}')).toThrow(/tools/);
    expect(() =>
      parseFixtureServers('{"servers":[{"id":"x","tools":[{"name":"a"}]}]}'),
    ).toThrow(/result/);
  });

  it("lists BARE tool names (refreshRoutes namespaces), preserves annotations, serves the canned result", async () => {
    const conn = makeFixtureConnection(parseFixtureServers(FIXTURE)[0]);
    const tools = await conn.listTools();
    // BARE names — main's refreshRoutes adds the `${serverId}__` prefix itself; a
    // pre-namespaced name would reach the model as `gmail__gmail__list_recent`.
    expect(tools.map((t) => t.name)).toEqual(["list_recent", "send_email"]);
    expect(tools.every((t) => t.serverId === "gmail")).toBe(true);
    expect(tools[0].annotations?.readOnlyHint).toBe(true);
    // send_email declares NO annotations → the write gate's "unknown ⇒ WRITE"
    // fail-closed default applies to it (the e2e relies on the gate firing).
    expect(tools[1].annotations).toBeUndefined();
    const res = await conn.callTool({ name: "list_recent", arguments: {} });
    expect(res.isError).toBeUndefined();
    expect(res.content[0]).toEqual({
      type: "text",
      text: "De: camille.vernay@exemple-corp.fr — Objet: Budget Q3",
    });
  });

  it("logs each call with the REAL routed args, and errors on an unknown tool", async () => {
    const calls: { server: string; tool: string; arguments: unknown }[] = [];
    const conn = makeFixtureConnection(parseFixtureServers(FIXTURE)[0], (e) => calls.push(e));
    // Routed (bare) and namespaced forms both resolve to the same tool.
    await conn.callTool({ name: "send_email", arguments: { to: "julien@acme.test" } });
    await conn.callTool({ name: "gmail__send_email", arguments: { to: "x@y.z" } });
    expect(calls.map((c) => c.tool)).toEqual(["send_email", "send_email"]);
    expect(calls[0].arguments).toEqual({ to: "julien@acme.test" });
    const bad = await conn.callTool({ name: "nope", arguments: {} });
    expect(bad.isError).toBe(true);
  });

  it("registration is DOUBLE env-gated — without both vars the live map is untouched", () => {
    const saved = {
      e2e: process.env.OPENMASQ_E2E,
      fx: process.env.OPENMASQ_E2E_MCP_FIXTURES,
    };
    try {
      const connected = new Map();
      delete process.env.OPENMASQ_E2E;
      delete process.env.OPENMASQ_E2E_MCP_FIXTURES;
      maybeRegisterE2eFixtureConnections(connected);
      process.env.OPENMASQ_E2E_MCP_FIXTURES = "/nonexistent/fixtures.json";
      maybeRegisterE2eFixtureConnections(connected); // OPENMASQ_E2E still unset
      expect(connected.size).toBe(0);
    } finally {
      if (saved.e2e === undefined) delete process.env.OPENMASQ_E2E;
      else process.env.OPENMASQ_E2E = saved.e2e;
      if (saved.fx === undefined) delete process.env.OPENMASQ_E2E_MCP_FIXTURES;
      else process.env.OPENMASQ_E2E_MCP_FIXTURES = saved.fx;
    }
  });
});

describe("e2eConnectorFilter — le sous-ensemble de connecteurs (E2E)", () => {
  const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it("DOUBLE gate : sans OPENMASQ_E2E, la restriction n'existe pas (production intacte)", () => {
    withEnv({ OPENMASQ_E2E: undefined, OPENMASQ_E2E_MCP_ONLY: "slack" }, () => {
      expect(e2eConnectorFilter()).toBeNull();
    });
  });

  it("sans la variable (ou vide), aucune restriction — tous les connecteurs remontent", () => {
    withEnv({ OPENMASQ_E2E: "1", OPENMASQ_E2E_MCP_ONLY: undefined }, () => {
      expect(e2eConnectorFilter()).toBeNull();
    });
    withEnv({ OPENMASQ_E2E: "1", OPENMASQ_E2E_MCP_ONLY: " , " }, () => {
      expect(e2eConnectorFilter()).toBeNull();
    });
  });

  it("garde les ids listés (casse/espaces ignorés) et les instances multi-comptes", () => {
    withEnv({ OPENMASQ_E2E: "1", OPENMASQ_E2E_MCP_ONLY: " Slack , posthog " }, () => {
      const keep = e2eConnectorFilter()!;
      expect(keep("slack")).toBe(true);
      expect(keep("posthog")).toBe(true);
      expect(keep("gmail--2")).toBe(false);
      expect(keep("neon")).toBe(false);
      // A multi-account instance of the listed connector stays included.
      expect(keep("slack--2")).toBe(true);
    });
  });
});
