import { describe, expect, it } from "vitest";
import type { McpTool } from "@openmasq/mcp";
import {
  toolCatalog,
  resolveLoadTools,
  LOAD_TOOLS_DEF,
  describeToolParams,
  exampleFromSchema,
  argErrorHint,
  unknownToolHint,
  canonicalToolName,
} from "./toolCatalog";
import { DEFAULT_CATALOG_CONFIG, } from "./routingConfig";

// A Webflow-style nested schema: args = { site_id, actions:[{ label, params }] }.
const NESTED = {
  type: "object",
  required: ["actions"],
  properties: {
    site_id: { type: "string", description: "L'identifiant du site." },
    mode: { type: "string", enum: ["draft", "publish"] },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: ["label"],
        properties: {
          label: { type: "string", description: "Le nom de l'action à exécuter." },
          count: { type: "integer" },
        },
      },
    },
  },
};

const tool = (name: string, serverId: string, description = "", schema: unknown = {}): McpTool =>
  ({ name, description, serverId, inputSchema: schema }) as McpTool;

describe("toolCatalog", () => {
  it("groups by connector (name prefix), trims long descriptions, no schemas", () => {
    const cat = toolCatalog([
      tool("webflow__list_pages", "ipc", "Lister les pages d'un site.", {
        type: "object",
        properties: { site_id: { type: "string", description: "SECRET-SCHEMA-MARKER" } },
      }),
      tool("webflow__create_page", "ipc", " ".repeat(5) + "x".repeat(300)),
      tool("canva__search", "ipc", "Chercher un design."),
    ]);
    // grouped by the NAME prefix (serverId is the transport "ipc", not the connector)
    expect(cat).toContain("## webflow");
    expect(cat).toContain("## canva");
    expect(cat).toContain("- webflow__list_pages — Lister les pages d'un site.");
    expect(cat).toContain("- canva__search — Chercher un design.");
    // description clamped to the default per-line length (so a 300-char desc can't bloat it)
    const longLine = cat.split("\n").find((l) => l.startsWith("- webflow__create_page"))!;
    expect(longLine.length).toBeLessThanOrEqual("- webflow__create_page — ".length + DEFAULT_CATALOG_CONFIG.descMaxChars);
    // no JSON schema keys leak
    expect(cat).not.toContain("SECRET-SCHEMA-MARKER");
    expect(cat).not.toContain("properties");
  });

  it("caps a huge catalog per server and notes how many were hidden", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      tool(`srv__tool_${i}`, "srv", `Description assez longue de l'outil numéro ${i} pour gonfler le catalogue.`),
    );
    const cat = toolCatalog(many);
    expect(cat.length).toBeLessThan(DEFAULT_CATALOG_CONFIG.catalogMaxChars * 1.2); // roughly within the budget
    expect(cat).toMatch(/… \(\+\d+ autres outils sur srv\)/);
  });
});

describe("resolveLoadTools", () => {
  const full = new Map<string, McpTool>([
    ["a", tool("a", "s", "A")],
    ["b", tool("b", "s", "B")],
    ["big", tool("big", "s", "Big", { type: "object", properties: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`p${i}`, { type: "string" }])) })],
  ]);

  it("loads unknown/valid names, dropping hallucinations", () => {
    const { add, content } = resolveLoadTools(["a", "nope", "b"], full, new Map(), 1_000_000);
    expect(add.map((t) => t.name)).toEqual(["a", "b"]);
    expect(content).toContain("Schémas chargés : a, b");
    expect(content).toContain("Inconnus : nope");
  });

  it("skips already-loaded names", () => {
    const loaded = new Map([["a", full.get("a")!]]);
    const { add, content } = resolveLoadTools(["a"], full, loaded, 1_000_000);
    expect(add).toEqual([]);
    expect(content).toContain("déjà chargés");
  });

  it("skips tools that would blow the context budget", () => {
    const { add, content } = resolveLoadTools(["big"], full, new Map(), 100);
    expect(add).toEqual([]);
    expect(content).toContain("Ignorés (trop volumineux pour le contexte) : big");
  });

  it("ignores a non-array tool_names payload", () => {
    const { add } = resolveLoadTools("oops", full, new Map(), 1_000_000);
    expect(add).toEqual([]);
  });

  it("expands a CONNECTOR name (prefix before __) to all its tools", () => {
    const wf = new Map<string, McpTool>([
      ["webflow__sites", tool("webflow__sites", "ipc", "List sites")],
      ["webflow__pages", tool("webflow__pages", "ipc", "List pages")],
      ["vercel__deploy", tool("vercel__deploy", "ipc", "Deploy")],
    ]);
    // A model that passes the connector name loads all its tools (case-insensitive).
    const { add, content } = resolveLoadTools(["Webflow"], wf, new Map(), 1_000_000);
    expect(add.map((t) => t.name).sort()).toEqual(["webflow__pages", "webflow__sites"]);
    expect(content).toContain("webflow__sites");
    expect(content).not.toContain("Inconnus");
  });

  it("names the AVAILABLE connectors when the model invented one (e.g. tavily)", () => {
    const connected = new Map<string, McpTool>([
      ["browser__browser_navigate", tool("browser__browser_navigate", "ipc", "Navigate")],
      ["canva__search", tool("canva__search", "ipc", "Search designs")],
    ]);
    const { add, content } = resolveLoadTools(["tavily"], connected, new Map(), 1_000_000);
    expect(add).toEqual([]);
    expect(content).toContain("Inconnus : tavily");
    expect(content).toContain("Connecteurs réellement disponibles : browser, canva");
    // browser present → steer web search to it, not an external service
    expect(content).toMatch(/browser/i);
  });

  it("the load_tools def is a tiny object schema with tool_names", () => {
    expect(LOAD_TOOLS_DEF.name).toBe("load_tools");
    expect((LOAD_TOOLS_DEF.parameters as { required: string[] }).required).toEqual(["tool_names"]);
  });
});

describe("unknownToolHint", () => {
  it("lists the real connectors + steers web search to browser", () => {
    const full = new Map<string, McpTool>([
      ["browser__browser_navigate", tool("browser__browser_navigate", "ipc", "Navigate")],
      ["canva__search", tool("canva__search", "ipc", "Search")],
    ]);
    const hint = unknownToolHint(full);
    expect(hint).toContain("n'invente pas d'outil");
    expect(hint).toContain("browser, canva");
    expect(hint).toContain("browser");
  });

  it("degrades gracefully with no connectors", () => {
    expect(unknownToolHint(new Map())).toContain("aucun connecteur");
  });
});

describe("describeToolParams", () => {
  it("outlines nested props with type/required/enum/description, recursing into array<object>", () => {
    const out = describeToolParams(NESTED);
    expect(out).toContain("site_id: string");
    expect(out).toContain("actions: array<object> (requis)");
    expect(out).toContain("mode: string — {draft|publish}");
    expect(out).toContain("L'identifiant du site.");
    // recursed into the array item's object props
    expect(out).toContain("  label: string (requis)");
    expect(out).toContain("  count: integer");
  });

  it("respects maxDepth (no recursion past it) and maxChars (truncates with …)", () => {
    const shallow = describeToolParams(NESTED, { maxDepth: 0 });
    expect(shallow).toContain("actions: array<object>");
    expect(shallow).not.toContain("label: string"); // not recursed
    const capped = describeToolParams(NESTED, { maxChars: 20 });
    expect(capped.length).toBeLessThanOrEqual(20);
    expect(capped.endsWith("…")).toBe(true);
  });

  it("returns '' for a non-object / property-less schema", () => {
    expect(describeToolParams(undefined)).toBe("");
    expect(describeToolParams({ type: "object" })).toBe("");
    expect(describeToolParams("nope")).toBe("");
  });
});

describe("exampleFromSchema", () => {
  it("builds a required-only, type-placeholdered, depth-bounded example", () => {
    const ex = exampleFromSchema(NESTED) as Record<string, unknown>;
    // only required top-level key
    expect(Object.keys(ex)).toEqual(["actions"]);
    const item = (ex.actions as unknown[])[0] as Record<string, unknown>;
    expect(item).toEqual({ label: "…" }); // only required nested key, string→"…"
    expect(exampleFromSchema({ type: "number" })).toBe(0);
    expect(exampleFromSchema({ type: "boolean" })).toBe(false);
    expect(exampleFromSchema({ enum: ["a", "b"] })).toBe("a");
  });

  it("stops at maxDepth", () => {
    const deep = { type: "object", required: ["a"], properties: { a: NESTED } };
    const ex = exampleFromSchema(deep, 1) as Record<string, unknown>;
    expect(ex).toEqual({ a: {} }); // depth 1 → nested object emptied
  });
});

describe("argErrorHint", () => {
  it("first attempt: outline only; second attempt: adds a minimal example", () => {
    const first = argErrorHint("webflow__element", NESTED, 1);
    expect(first).toContain("Paramètres attendus pour webflow__element");
    expect(first).toContain("actions: array<object> (requis)");
    expect(first).not.toContain("Exemple d'appel minimal");
    const second = argErrorHint("webflow__element", NESTED, 2);
    expect(second).toContain("Exemple d'appel minimal");
    expect(second).toContain('"label": "…"');
  });

  it("returns '' when the schema has no describable params", () => {
    expect(argErrorHint("x", {}, 2)).toBe("");
  });
});

describe("le catalogue dit ce qu'un connecteur NE PEUT PAS faire", () => {
  it("Gmail ne porte PLUS la note « clés de l'utilisateur » (1-clic plein depuis le 30/07/2026)", () => {
    // The 1-click covers read + send: advising « les clés de l'utilisateur » would
    // now be FALSE advice (a connection from before 30/07 only needs a
    // RECONNECTION). The guard against invented tools remains the closing phrase
    // « aucun autre outil » — pinned by the next test — true by construction.
    const out = toolCatalog([
      { name: "gmail__send_email", description: "Envoyer un email", inputSchema: {}, serverId: "ipc" },
    ] as never);
    expect(out).not.toContain("clés de l'utilisateur");
    expect(out).toContain("aucun autre outil sur gmail");
  });

  it("clôt CHAQUE connecteur — la phrase qui coupe court à l'invention", () => {
    const out = toolCatalog([
      { name: "slack__list_channels", description: "Lister les canaux", inputSchema: {}, serverId: "ipc" },
    ] as never);
    expect(out).toContain("aucun autre outil sur slack");
  });
});

describe("canonicalToolName — un nom nu ne doit pas faire mentir les politiques", () => {
  const advertised = [
    "browser__browser_navigate",
    "github__search_repos",
    "linear__list_issues",
  ];

  it("recale le nom nu sur l'outil annoncé (le cas du journal du 27/07/2026)", () => {
    expect(canonicalToolName("browser_navigate", advertised)).toBe("browser__browser_navigate");
  });

  it("laisse un nom DÉJÀ canonique intact", () => {
    expect(canonicalToolName("github__search_repos", advertised)).toBe("github__search_repos");
  });

  // INTERCEPTED tools have no prefix and must never be recast — they're
  // actually handled earlier, but the function must be safe in isolation.
  it.each(["load_tools", "run_python", "memory_search", "web_fetch_many", "suggest_integrations"])(
    "ne touche pas à l'outil interne %s",
    (n) => {
      expect(canonicalToolName(n, advertised)).toBe(n);
    },
  );

  // ⚠️ The model's name CONFERS nothing: it can only DESIGNATE an entry in our own
  // advertised table. Ambiguous ⇒ we don't choose (the client will fail, and that's fine).
  it("refuse de choisir quand deux connecteurs exposent le même nom nu", () => {
    const two = ["gmail__send_email", "microsoft-outlook__send_email"];
    expect(canonicalToolName("send_email", two)).toBe("send_email");
  });

  it("un nom qui ne correspond à rien reste tel quel", () => {
    expect(canonicalToolName("tavily__search", advertised)).toBe("tavily__search");
    expect(canonicalToolName("inexistant", advertised)).toBe("inexistant");
  });

  // A suffix is not a connector boundary: `navigate` must not capture
  // `browser__browser_navigate` just because the name ends the same way.
  it("ne matche que sur la frontière `__`, pas sur une fin de chaîne quelconque", () => {
    expect(canonicalToolName("navigate", advertised)).toBe("navigate");
  });
});
