/**
 * Anthropic `input_schema` hardening — the ONE place a tool's JSON-Schema is made
 * acceptable to the Messages API before it rides `anthropicToolsBody`.
 *
 * ⚠️ The failure this exists for is SESSION-WIDE, not tool-wide. Anthropic rejects
 * `anyOf`/`oneOf`/`allOf` at the TOP level of an input schema:
 *
 *   tools.N.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf
 *   at the top level
 *
 * The whole `tools` array travels in every request, so ONE connector advertising such a
 * schema 400s EVERY turn of the conversation — including turns that would never have
 * called it. With 57 connectors / 102 tools in the catalog (plus arbitrary user-added MCP
 * servers) that is not a hypothetical: the schema is authored by a third party, not us.
 *
 * Anthropic only refuses combinators at the top level, so nested ones are left ALONE —
 * this flattens the outermost layer and nothing else. The sibling `google.ts`
 * (`sanitizeGeminiSchema`) does the same job for Gemini's much narrower OpenAPI subset;
 * the two are deliberately separate because they refuse different things.
 */

type Schema = Record<string, unknown>;

/** The three JSON-Schema combinators Anthropic refuses at the top level. */
const COMBINATORS = ["anyOf", "oneOf", "allOf"] as const;

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Collapse ONE top-level combinator into a flat object schema, recursing first so a
 * variant that is itself a combinator resolves too.
 *
 * `required` is the part that must not be got wrong, and the two families are opposites:
 * - `allOf` — every branch applies, so a field required by ANY branch is required (union).
 * - `anyOf`/`oneOf` — only one branch applies, so a field is only genuinely required when
 *   EVERY branch requires it (intersection). Taking the union here would make the model
 *   fill fields belonging to a variant it isn't using, which is a worse call than none.
 */
function flattenTopLevelCombinator(schema: Schema): Schema {
  const key = COMBINATORS.find((k) => Array.isArray(schema[k]));
  if (!key) return schema;

  const variants = (schema[key] as unknown[]).filter(isSchema).map(flattenTopLevelCombinator);
  const { [key]: _dropped, ...base } = schema;
  if (!variants.length) return base; // `anyOf: []` / a list of non-objects — just drop it

  // Base properties first, then each variant's: a name already present wins, so the
  // outer schema's own declaration is never shadowed by a branch's.
  const properties: Schema = isSchema(base.properties) ? { ...base.properties } : {};
  for (const variant of variants) {
    if (!isSchema(variant.properties)) continue;
    for (const [name, prop] of Object.entries(variant.properties)) {
      if (!(name in properties)) properties[name] = prop;
    }
  }

  const perVariantRequired = variants.map((v) => stringList(v.required));
  const merged =
    key === "allOf"
      ? perVariantRequired.flat()
      : perVariantRequired[0]!.filter((name) => perVariantRequired.every((set) => set.includes(name)));

  const required = [...new Set([...stringList(base.required), ...merged])];

  return {
    ...base,
    properties,
    ...(required.length ? { required } : {}),
  };
}

/**
 * The schema to send as a tool's `input_schema`.
 *
 * Returns the input UNCHANGED (same reference) whenever it is already valid — the
 * overwhelmingly common case — so this is a no-op for every well-formed connector and
 * only the pathological ones pay anything.
 *
 * A schema that isn't an object schema at all (not an object, or an incompatible `type`)
 * is coerced to a minimal object schema rather than passed through: Anthropic 400s on it,
 * and losing ONE tool's arguments is strictly better than losing every turn of the
 * conversation. The tool stays callable with no arguments.
 *
 * ⚠️ It adds NOTHING else — notably not an empty `properties`, which Anthropic does not
 * require. Every key this touches is a byte that changes in the cached prefix, so the rule
 * is: fix what the API refuses, normalise nothing.
 */
export function anthropicToolSchema(parameters: unknown): Schema {
  if (!isSchema(parameters)) return { type: "object", properties: {} };

  const flattened = flattenTopLevelCombinator(parameters);
  const needsType = flattened.type !== "object";
  if (flattened === parameters && !needsType) return parameters;

  return { ...flattened, ...(needsType ? { type: "object" } : {}) };
}
