// The JSON Schema of `~/.openmasq/proxy.json`, generated from the options table — never
// written by hand, so it cannot drift from what the parser accepts. `config init` writes it
// beside the file, and the file's `$schema` points at it for the editor's completion.
import { OPTIONS, type Option } from "./options.js";

/** JSON Schema (draft 2020-12) for the file, from the table — never written by hand. */
export function jsonSchema(): Record<string, unknown> {
  const prop = (o: Option): Record<string, unknown> => {
    const base = { description: o.doc };
    switch (o.kind) {
      case "string":
        return { ...base, type: "string" };
      case "number":
        return { ...base, type: "integer", minimum: 1, maximum: 65535 };
      case "boolean":
        return { ...base, type: "boolean" };
      case "list":
        return { ...base, type: "array", items: { type: "string" } };
      case "enum":
        return { ...base, enum: [...o.values] };
      case "always":
        return {
          ...base,
          type: "array",
          items: {
            anyOf: [
              { type: "string", pattern: "^.+(:[a-z_]+)?$" },
              {
                type: "object",
                required: ["value"],
                properties: { value: { type: "string" }, category: { type: "string" } },
                additionalProperties: false,
              },
            ],
          },
        };
    }
  };
  const settings = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(OPTIONS.filter((o) => o.file).map((o) => [o.name, prop(o)])),
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "openmasq-proxy configuration",
    type: "object",
    additionalProperties: false,
    properties: {
      $schema: { type: "string" },
      run: { ...settings, description: "the settings of every run — the flags, by name" },
      clients: {
        type: "object",
        description: "overrides by wrapped tool (claude, hermes, opencode…)",
        additionalProperties: settings,
      },
      mcp: {
        type: "object",
        description: "per-server policy: which side provides it, and how its results are masked",
        additionalProperties: { type: "object" },
      },
    },
  };
}
