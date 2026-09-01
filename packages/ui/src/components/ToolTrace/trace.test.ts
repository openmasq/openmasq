import { BRAND } from "@openmasq/branding";
import { describe, it, expect } from "vitest";
import {
  groupToolCalls,
  connectorPresentation,
  splitToolName,
  hasFailedTool,
  isCurrentStep,
} from "./trace";
import { summarizeToolResult } from "../../agent/mcpAgent";

describe("connectorPresentation", () => {
  it("resolves a known connector's name + tone from the catalog", () => {
    const p = connectorPresentation("linear");
    expect(p.name).toBe("Linear");
    expect(p.tone).toBe("violet");
    expect(p.glyph).toBe("LI");
  });

  it("falls back to a capitalised id + default tone for unknown servers", () => {
    const p = connectorPresentation("acme");
    expect(p.name).toBe("Acme");
    expect(p.tone).toBe("violet"); // default hue
    expect(p.glyph).toBe("AC");
    expect(p.builtin).toBe(false);
  });

  it("presents the code interpreter as a built-in service, NOT 'Python'/'Mcp'", () => {
    const p = connectorPresentation("python");
    expect(p.name).toBe("Analyse & graphiques");
    expect(p.builtin).toBe(true); // → no "MCP" badge in the card
  });
});

describe("splitToolName", () => {
  it("splits a namespaced tool into connector + bare tool", () => {
    expect(splitToolName("linear__list_issues")).toEqual({ server: "linear", tool: "list_issues" });
  });
  it("keeps a bare tool name under the generic 'mcp' connector", () => {
    expect(splitToolName("do_thing")).toEqual({ server: "mcp", tool: "do_thing" });
  });
  it("routes the built-in run_python to its canonical pseudo-server", () => {
    // So the LIVE row (bare `run_python`) groups with the PERSISTED `server:"python"`
    // card — not a separate "McpMCP" one.
    expect(splitToolName("run_python")).toEqual({ server: "python", tool: "run_python" });
  });
});

describe("groupToolCalls — built-in interpreter", () => {
  it("groups the live run_python row into the SAME python card as the persisted call", () => {
    const runs = groupToolCalls(
      [{ tool: "run_python", server: "python", ok: true, summary: "figure.png" }],
      "run_python", // a live retry while streaming
    );
    expect(runs).toHaveLength(1); // one card, not python + mcp
    expect(runs[0].serverId).toBe("python");
    expect(runs[0].name).toBe("Analyse & graphiques");
    expect(runs[0].builtin).toBe(true);
  });
});

describe("groupToolCalls — durations", () => {
  it("SUMS the collapsed retries' durations (where the time went, not the last attempt's)", () => {
    const runs = groupToolCalls([
      { tool: "search", server: "canva", ok: false, ms: 4_000 },
      { tool: "search", server: "canva", ok: true, summary: "3 résultats", ms: 2_500 },
    ]);
    expect(runs[0].tools).toHaveLength(1);
    expect(runs[0].tools[0].ms).toBe(6_500);
  });
  it("leaves ms undefined when no attempt carried one (a pre-upgrade persisted trace)", () => {
    const runs = groupToolCalls([{ tool: "search", server: "canva", ok: true }]);
    expect(runs[0].tools[0].ms).toBeUndefined();
  });
});

describe("hasFailedTool", () => {
  it("is true when a tool's FINAL state is error", () => {
    expect(hasFailedTool([{ tool: "canva__generate-design", server: "canva", ok: false }])).toBe(true);
  });
  it("is false for an all-succeeded flow", () => {
    expect(hasFailedTool([{ tool: "canva__search", server: "canva", ok: true }])).toBe(false);
  });
  it("is false when a failed call later RECOVERED (collapsed to a success)", () => {
    expect(
      hasFailedTool([
        { tool: "canva__generate-design", server: "canva", ok: false },
        { tool: "canva__generate-design", server: "canva", ok: true, summary: "design.png" },
      ]),
    ).toBe(false);
  });
  it("is false for no calls", () => {
    expect(hasFailedTool(undefined)).toBe(false);
    expect(hasFailedTool([])).toBe(false);
  });
});

describe("groupToolCalls", () => {
  it("groups persisted calls by connector in first-appearance order", () => {
    const runs = groupToolCalls([
      { tool: "list_issues", server: "linear", ok: true, summary: "14 tickets" },
      { tool: "get_cycle", server: "linear", ok: true, summary: "Cycle 24" },
      { tool: "search_pages", server: "notion", ok: true, summary: "4 pages" },
    ]);
    expect(runs.map((r) => r.serverId)).toEqual(["linear", "notion"]);
    expect(runs[0].tools).toHaveLength(2);
    expect(runs[0].tools[0]).toMatchObject({ name: "list_issues", summary: "14 tickets", state: "done" });
    expect(runs[1].tools[0].summary).toBe("4 pages");
  });

  it("marks a failed call as error and appends the live running step", () => {
    const runs = groupToolCalls(
      [{ tool: "list_issues", server: "linear", ok: false }],
      "linear__get_cycle",
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].tools[0].state).toBe("error");
    expect(runs[0].tools[1]).toMatchObject({ name: "get_cycle", state: "running" });
  });

  it("returns nothing when there are no calls", () => {
    expect(groupToolCalls(undefined)).toEqual([]);
    expect(groupToolCalls([])).toEqual([]);
  });
});

describe("groupToolCalls — collapse repeated same-tool calls", () => {
  it("collapses consecutive failures + a recovery into ONE done row", () => {
    const runs = groupToolCalls([
      { tool: "search", server: "stripe", ok: false },
      { tool: "search", server: "stripe", ok: false },
      { tool: "search", server: "stripe", ok: true, summary: "1 élément" },
      { tool: "fetch", server: "stripe", ok: true, summary: "cus_123" },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].tools).toHaveLength(2); // search (collapsed) + fetch — no wall of failure
    expect(runs[0].tools[0]).toMatchObject({
      name: "search",
      state: "done",
      summary: "1 élément",
      attempts: 3,
      failures: 2,
    });
    expect(runs[0].tools[1].name).toBe("fetch");
  });

  it("collapses an all-failed loop into a single error row", () => {
    const runs = groupToolCalls([
      { tool: "search", server: "stripe", ok: false },
      { tool: "search", server: "stripe", ok: false },
      { tool: "search", server: "stripe", ok: false },
    ]);
    expect(runs[0].tools).toHaveLength(1);
    expect(runs[0].tools[0]).toMatchObject({ state: "error", attempts: 3, failures: 3 });
  });

  it("does NOT collapse the same tool when a different tool interleaves", () => {
    const runs = groupToolCalls([
      { tool: "search", server: "stripe", ok: false },
      { tool: "fetch", server: "stripe", ok: true },
      { tool: "search", server: "stripe", ok: true, summary: "ok" },
    ]);
    expect(runs[0].tools.map((t) => t.name)).toEqual(["search", "fetch", "search"]);
  });

  it("merges a live retry (pendingTool) onto prior failures as one running row", () => {
    const runs = groupToolCalls([{ tool: "search", server: "stripe", ok: false }], "stripe__search");
    expect(runs[0].tools).toHaveLength(1);
    expect(runs[0].tools[0]).toMatchObject({ name: "search", state: "running", attempts: 2 });
  });
});

describe("connectorPresentation — un outil INTÉGRÉ n'est pas un connecteur", () => {
  it("le lecteur web est un builtin, pas un « connecteur » que l'utilisateur aurait branché", () => {
    const p = connectorPresentation("web");
    expect(p.builtin).toBe(true);
    expect(p.name).toBe("Lecture web");
    // Pas de pastille de lettres : la carte lui rend une vraie icône.
    expect(p.glyph).toBe("");
  });

  it("…comme l'interpréteur et le navigateur", () => {
    expect(connectorPresentation("python").builtin).toBe(true);
    expect(connectorPresentation("browser").builtin).toBe(true);
    // Un vrai connecteur garde son badge.
    expect(connectorPresentation("linear").builtin).toBe(false);
  });
});

describe("isCurrentStep", () => {
  const calls = [
    { tool: "stripe_api_search", server: "stripe", ok: true, ms: 4000 },
    { tool: "stripe_api_read", server: "stripe", ok: true, ms: 22000 },
  ];

  it("marks the LAST step while the turn is live and nothing is in flight", () => {
    const runs = groupToolCalls(calls);
    expect(isCurrentStep(runs, true, 0, 1)).toBe(true);
    expect(isCurrentStep(runs, true, 0, 0)).toBe(false);
  });

  it("marks nothing once the turn has settled", () => {
    const runs = groupToolCalls(calls);
    expect(isCurrentStep(runs, false, 0, 1)).toBe(false);
  });

  it("defers to the in-flight spinner — two moving dots claim two things at once", () => {
    const runs = groupToolCalls(calls, "stripe__stripe_api_write");
    expect(runs[0].tools[2].state).toBe("running");
    expect(isCurrentStep(runs, true, 0, 2)).toBe(false);
  });

  it("only ever marks the LAST card when several connectors ran", () => {
    const runs = groupToolCalls([...calls, { tool: "list_issues", server: "linear", ok: true }]);
    expect(runs).toHaveLength(2);
    expect(isCurrentStep(runs, true, 0, 1)).toBe(false);
    expect(isCurrentStep(runs, true, 1, 0)).toBe(true);
  });
});

describe("summarizeToolResult", () => {
  it("counts items for a JSON array result", () => {
    expect(summarizeToolResult(JSON.stringify([1, 2, 3]))).toBe("3 éléments");
    expect(summarizeToolResult(JSON.stringify(["a"]))).toBe("1 élément");
  });
  it("counts the first array field of a JSON object", () => {
    expect(summarizeToolResult(JSON.stringify({ total: 2, items: [{}, {}] }))).toBe("2 éléments");
  });
  it("returns a bounded first-line excerpt for plain text", () => {
    expect(summarizeToolResult("README.md\nsome more")).toBe("README.md");
    expect(summarizeToolResult("x".repeat(80))).toHaveLength(48); // 47 + ellipsis
  });
  it("is undefined for empty content", () => {
    expect(summarizeToolResult("")).toBeUndefined();
    expect(summarizeToolResult("   ")).toBeUndefined();
  });
});

describe("un refus utilisateur n'est PAS un échec", () => {
  // Regression (noted 14/08): declining a write on the confirmation card
  // rendered a bare `ok:false` — the trace painted « échec » and the bubble offered
  // « Réessayer » on the very action just declined.
  const refus = { tool: "send_email", server: "gmail", ok: false, declined: true };
  const panne = { tool: "send_email", server: "gmail", ok: false };

  it("hasFailedTool ignore le refus — pas de bandeau « une étape a échoué »", () => {
    expect(hasFailedTool([refus])).toBe(false);
    expect(hasFailedTool([panne])).toBe(true);
    // A flow mixing both keeps the banner: the real failure is the one that gets retried.
    expect(hasFailedTool([refus, panne])).toBe(true);
  });

  it("le tracé porte l'état « declined », distinct d'« error »", () => {
    const [run] = groupToolCalls([refus]);
    expect(run!.tools[0]!.state).toBe("declined");
    // …and a decline doesn't count as a failed attempt of a collapsed row.
    expect(run!.tools[0]!.failures).toBe(0);
  });
});

describe("un échec porte sa cause jusqu'à la ligne (15/08/2026)", () => {
  it("la note d'un refus de l'app survit au regroupement", () => {
    const runs = groupToolCalls([
      {
        tool: "notion-create-pages",
        server: "notion",
        ok: false,
        note: `refusé par ${BRAND.name} — demande lue comme une consultation`,
      },
    ]);
    const row = runs[0]?.tools[0];
    expect(row?.state).toBe("error");
    // This is the note the row displays: « échec — refusé par … ». Without it,
    // the user only reads the model's paraphrase, which blames the third-party service.
    expect(row?.note).toContain(`refusé par ${BRAND.name}`);
  });
});
