import { describe, it, expect } from "vitest";
import { anthropicToolSchema } from "./anthropicSchema";
import { anthropicToolsBody } from "./anthropicBody";
import type { CompleteToolsOptions } from "../types";

/**
 * The invariant: a THIRD-PARTY tool schema can never make Anthropic refuse the request.
 * The regression this pins is session-wide — one connector's `anyOf` used to 400 every
 * turn of the conversation, including turns that would never have called that tool.
 */
describe("anthropicToolSchema", () => {
  it("laisse INTACT (même référence) un schéma déjà valide", () => {
    // The 99% case must be a true no-op — no re-allocation, no reordering, nothing that
    // could perturb the prompt cache by changing the serialised bytes.
    const schema = {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" } },
      required: ["to"],
    };
    expect(anthropicToolSchema(schema)).toBe(schema);
  });

  it("aplatit un `anyOf` de premier niveau (le cas qui cassait la session)", () => {
    // Shape taken from a real offender: a top-level anyOf of two alternative argument
    // sets. Anthropic refuses it outright; flattened, the tool stays callable.
    const flat = anthropicToolSchema({
      type: "object",
      anyOf: [
        { properties: { id: { type: "string" } }, required: ["id"] },
        { properties: { name: { type: "string" } }, required: ["name"] },
      ],
    });

    expect(flat.anyOf).toBeUndefined();
    expect(Object.keys(flat.properties as Record<string, unknown>).sort()).toEqual(["id", "name"]);
    // Neither branch's field is required on its own: requiring `id` would force the model
    // to fill a field belonging to the variant it did not choose.
    expect(flat.required).toBeUndefined();
  });

  it("`anyOf` : un champ requis par TOUTES les branches le reste", () => {
    const flat = anthropicToolSchema({
      type: "object",
      anyOf: [
        { properties: { org: { type: "string" }, id: { type: "string" } }, required: ["org", "id"] },
        { properties: { org: { type: "string" }, name: { type: "string" } }, required: ["org", "name"] },
      ],
    });
    expect(flat.required).toEqual(["org"]);
  });

  it("`allOf` : les branches se cumulent, donc les `required` s'UNISSENT", () => {
    const flat = anthropicToolSchema({
      type: "object",
      required: ["base"],
      properties: { base: { type: "string" } },
      allOf: [
        { properties: { a: { type: "string" } }, required: ["a"] },
        { properties: { b: { type: "string" } }, required: ["b"] },
      ],
    });
    expect(flat.required).toEqual(["base", "a", "b"]);
    expect(Object.keys(flat.properties as Record<string, unknown>).sort()).toEqual(["a", "b", "base"]);
  });

  it("ne touche PAS un combinateur IMBRIQUÉ (Anthropic ne refuse que le premier niveau)", () => {
    const schema = {
      type: "object",
      properties: { filter: { anyOf: [{ type: "string" }, { type: "number" }] } },
    };
    expect(anthropicToolSchema(schema)).toBe(schema);
  });

  it("résout un combinateur dont une BRANCHE est elle-même un combinateur", () => {
    const flat = anthropicToolSchema({
      type: "object",
      anyOf: [{ anyOf: [{ properties: { deep: { type: "string" } } }] }],
    });
    expect(flat.anyOf).toBeUndefined();
    expect(flat.properties).toHaveProperty("deep");
  });

  it("la propriété du schéma de base gagne sur celle d'une branche", () => {
    const flat = anthropicToolSchema({
      type: "object",
      properties: { id: { type: "string", description: "canonique" } },
      anyOf: [{ properties: { id: { type: "number" } } }],
    });
    expect((flat.properties as Record<string, { type: string }>).id.type).toBe("string");
  });

  it("un schéma qui n'est pas un objet dégrade vers un schéma objet, jamais vers un 400", () => {
    // Losing ONE tool's arguments beats losing every turn of the conversation.
    for (const bad of [undefined, null, "string", 42, [], { type: "string" }]) {
      expect(anthropicToolSchema(bad).type).toBe("object");
    }
    // Only when there was no schema AT ALL do we invent a `properties`.
    expect(anthropicToolSchema(null)).toEqual({ type: "object", properties: {} });
  });

  it("n'AJOUTE rien que l'API n'exige — `{type:'object'}` nu passe tel quel", () => {
    // Anthropic does not require `properties`. Every key added here is a byte that
    // changes in the cached prefix, so the sanitizer fixes refusals and normalises nothing.
    const bare = { type: "object" };
    expect(anthropicToolSchema(bare)).toBe(bare);
  });

  it("un `anyOf` vide est simplement retiré", () => {
    const flat = anthropicToolSchema({ type: "object", properties: { a: { type: "string" } }, anyOf: [] });
    expect(flat.anyOf).toBeUndefined();
    expect(flat.properties).toHaveProperty("a");
  });
});

describe("le corps de requête Anthropic applique l'assainissement", () => {
  // The unit above proves the transform; this proves it is actually WIRED — a pure
  // helper nobody calls is the failure mode a schema test alone cannot catch.
  const opts = (tools: CompleteToolsOptions["tools"]): CompleteToolsOptions => ({
    provider: "anthropic",
    model: "claude-opus-4-8",
    apiKey: "k",
    messages: [{ role: "user", content: "salut" }],
    tools,
  });

  it("aucun combinateur de premier niveau ne part sur le fil", () => {
    const body = JSON.parse(
      anthropicToolsBody(
        opts([
          {
            name: "posthog__file_download_batch_exports_create",
            description: "…",
            parameters: {
              type: "object",
              anyOf: [
                { properties: { export_id: { type: "string" } }, required: ["export_id"] },
                { properties: { query: { type: "string" } }, required: ["query"] },
              ],
            },
          },
        ]),
        false,
      ),
    );

    const schema = body.tools[0].input_schema;
    expect(schema.anyOf).toBeUndefined();
    expect(schema.oneOf).toBeUndefined();
    expect(schema.allOf).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties).sort()).toEqual(["export_id", "query"]);
  });

  it("le point de cache reste sur le DERNIER outil (l'assainissement ne le déplace pas)", () => {
    const body = JSON.parse(
      anthropicToolsBody(
        opts([
          { name: "a", description: "", parameters: { type: "object", properties: {} } },
          { name: "b", description: "", parameters: { type: "object", anyOf: [{ properties: {} }] } },
        ]),
        false,
      ),
    );
    expect(body.tools[0].cache_control).toBeUndefined();
    expect(body.tools[1].cache_control).toEqual({ type: "ephemeral" });
  });
});
