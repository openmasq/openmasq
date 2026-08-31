import { describe, expect, it } from "vitest";
import { schemaBlindProblems } from "./schemaBlind";

const SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string" },
    filters: { type: "string" },
    limit: { type: "integer" },
  },
  required: ["query"],
};

describe("schemaBlindProblems — l'appel aveugle ne part que s'il est prouvable-valide", () => {
  it("le cas EXACT du journal du 06/08 : JSON-chaîne avec une accolade en trop → rejeté", () => {
    // What the model actually emitted toward intercom__search_conversations.
    const { problems, param } = schemaBlindProblems(
      { type: "object", properties: { filters: { type: "string" } } },
      { filters: '{"from": 1767225600, "to": 1772563200, "type": "conversation"}}' },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("filters");
    expect(problems[0]).toContain("ne se parse pas");
    expect(param).toBe("filters"); // the faulty parameter goes into telemetry, never its value
  });

  it("des args qui respectent le schéma → aucun problème, l'appel part (pas de régression du chemin qui marchait)", () => {
    expect(schemaBlindProblems(SCHEMA, { query: "tickets T2", limit: 50 }).problems).toEqual([]);
  });

  it("un requis manquant est nommé", () => {
    expect(schemaBlindProblems(SCHEMA, { limit: 3 }).param).toBe("query");
  });

  it("un type prouvablement faux est signalé", () => {
    expect(schemaBlindProblems(SCHEMA, { query: "x", limit: "beaucoup" }).problems).toHaveLength(1);
  });

  it("un JSON-chaîne VALIDE passe — le style intercom (filters stringifié) reste permis", () => {
    expect(
      schemaBlindProblems(SCHEMA, { query: "x", filters: '{"from": 1, "to": 2}' }).problems,
    ).toEqual([]);
  });

  it("faux positifs évités : un template `{%…%}` ou du moustache n'est pas « du JSON raté »", () => {
    const s = { type: "object", properties: { content: { type: "string" } } };
    expect(schemaBlindProblems(s, { content: "{% for x in items %}{{ x }}{% endfor %}" }).problems).toEqual([]);
    expect(schemaBlindProblems(s, { content: "{{greeting}}, bonjour" }).problems).toEqual([]);
  });

  it("une prose qui commence par une accolade nue n'est pas inquiétée", () => {
    const s = { type: "object", properties: { note: { type: "string" } } };
    expect(schemaBlindProblems(s, { note: "{a} devient {b} après la passe" }).problems).toEqual([]);
  });

  it("une propriété déclarée OBJET reste l'affaire du validateur de types, pas du parseur de chaînes", () => {
    const s = { type: "object", properties: { filters: { type: "object" } } };
    // A string where an object is declared → type violation (1 problem), not double-flagged.
    expect(schemaBlindProblems(s, { filters: '{"a": 1}}' }).problems).toHaveLength(1);
  });

  it("schéma illisible → on ne peut rien prouver, l'appel part", () => {
    expect(schemaBlindProblems(undefined, { anything: "goes" }).problems).toEqual([]);
    expect(schemaBlindProblems(null, {}).problems).toEqual([]);
  });

  it("un argument non déclaré mais JSON-cassé est quand même signalé (le schéma ne le couvre pas, la chaîne si)", () => {
    // `filters` absent from the schema: many servers tolerate the extra — but if it's
    // malformed JSON, it can only fail server-side; may as well say so without sending it.
    const s = { type: "object", properties: {} };
    expect(schemaBlindProblems(s, { filters: '[{"a": 1}' }).problems).toHaveLength(1);
  });
});
