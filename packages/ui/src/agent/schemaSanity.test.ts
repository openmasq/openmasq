import { describe, expect, it } from "vitest";
import { sanitizeToolSchemas } from "./schemaSanity";
import type { McpTool } from "@openmasq/mcp";

const tool = (inputSchema: Record<string, unknown>): McpTool => ({
  name: "intercom__search_conversations",
  description: "d",
  inputSchema: inputSchema as McpTool["inputSchema"],
  serverId: "ipc",
});

/** Un schéma à la Intercom : n propriétés, toutes requises. */
const allRequired = (n: number): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) properties[`f${i}`] = { type: "string" };
  return { type: "object", properties, required: Object.keys(properties) };
};

describe("schemaSanity — le required dégénéré d'un serveur MCP distant", () => {
  it("retire un required qui couvre la quasi-totalité de nombreuses propriétés (le cas Intercom)", () => {
    const [t] = sanitizeToolSchemas([tool(allRequired(45))]);
    expect(t.inputSchema.required).toBeUndefined();
    expect(Object.keys(t.inputSchema.properties as object)).toHaveLength(45);
  });

  it("ne touche JAMAIS un required court et plausible", () => {
    const schema = {
      type: "object",
      properties: { email: { type: "string" }, role: { type: "string" }, note: { type: "string" } },
      required: ["email", "role"],
    };
    const [t] = sanitizeToolSchemas([tool(schema)]);
    expect(t.inputSchema).toBe(schema);
  });

  it("sous le seuil de compte, même une couverture totale reste intacte (7 champs tous requis)", () => {
    const schema = allRequired(7);
    const [t] = sanitizeToolSchemas([tool(schema)]);
    expect(t.inputSchema).toBe(schema);
  });

  it("au-dessus du compte mais sous le ratio, intact (10 requis sur 40 propriétés)", () => {
    const schema = allRequired(40);
    (schema.required as string[]).length = 10;
    const [t] = sanitizeToolSchemas([tool(schema)]);
    expect(t.inputSchema).toBe(schema);
  });

  it("assainit AUSSI un objet imbriqué dégénéré, sans toucher ses voisins sains", () => {
    const nested = {
      type: "object",
      properties: {
        filter: allRequired(20),
        window: {
          type: "object",
          properties: { operator: { type: "string" }, value: { type: "number" } },
          required: ["operator", "value"],
        },
      },
      required: ["filter"],
    };
    const [t] = sanitizeToolSchemas([tool(nested)]);
    const props = t.inputSchema.properties as Record<string, Record<string, unknown>>;
    expect(props.filter.required).toBeUndefined();
    expect(props.window.required).toEqual(["operator", "value"]);
    // Le required PLAUSIBLE de la racine (1 champ) survit.
    expect(t.inputSchema.required).toEqual(["filter"]);
  });

  it("un outil sain ressort par la MÊME référence (rien n'est recopié pour rien)", () => {
    const t = tool({ type: "object", properties: { q: { type: "string" } }, required: ["q"] });
    const arr = [t];
    expect(sanitizeToolSchemas(arr)).toBe(arr);
  });

  it("tolère un schéma sans properties, un items en tableau, un required non-string", () => {
    const odd = tool({ type: "object", required: [1, 2, 3] as unknown as string[] });
    expect(() => sanitizeToolSchemas([odd])).not.toThrow();
    const arr2 = tool({ type: "array", items: allRequired(12) });
    const [t2] = sanitizeToolSchemas([arr2]);
    expect((t2.inputSchema.items as Record<string, unknown>).required).toBeUndefined();
  });
});
