import { describe, expect, it } from "vitest";
import { argsMatchSchema } from "./toolFault";

describe("argsMatchSchema — à qui la faute quand un connecteur refuse", () => {
  // The real schema of `google-calendar__list_events`: NO required argument.
  const LIST_EVENTS = {
    type: "object",
    properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
  };

  it("l'appel signalé était CONFORME — donc le 400 n'était pas la faute du modèle", () => {
    // That's the whole point: the app displayed « le modèle a eu du mal (arguments
    // invalides) » and advised switching to Claude, which would have sent exactly this.
    expect(argsMatchSchema(LIST_EVENTS, { limit: 10 })).toBe(true);
    expect(argsMatchSchema(LIST_EVENTS, {})).toBe(true);
  });

  it("mais une vraie violation reste une vraie violation", () => {
    expect(argsMatchSchema(LIST_EVENTS, { limit: "dix" })).toBe(false); // wrong type
    expect(argsMatchSchema(LIST_EVENTS, { limit: 99 })).toBe(false); // out of bounds
    expect(argsMatchSchema(LIST_EVENTS, { limit: 2.5 })).toBe(false); // not an integer
  });

  it("un champ requis absent ou vide reste la faute du modèle", () => {
    const schema = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
    expect(argsMatchSchema(schema, {})).toBe(false);
    expect(argsMatchSchema(schema, { id: "  " })).toBe(false);
    expect(argsMatchSchema(schema, { id: "m1" })).toBe(true);
  });

  it("respecte un enum, et ignore ce qu'il ne sait pas prouver", () => {
    const schema = {
      type: "object",
      properties: { mode: { type: "string", enum: ["a", "b"] } },
    };
    expect(argsMatchSchema(schema, { mode: "c" })).toBe(false);
    expect(argsMatchSchema(schema, { mode: "b" })).toBe(true);
    // An UNDECLARED property is not a proven violation (many servers
    // accept them), and an unreadable schema means "we can't tell" = no blame.
    expect(argsMatchSchema(schema, { mode: "a", extra: 1 })).toBe(true);
    expect(argsMatchSchema(undefined, { anything: 1 })).toBe(true);
    expect(argsMatchSchema({ type: "object" }, { anything: 1 })).toBe(true);
  });
});
