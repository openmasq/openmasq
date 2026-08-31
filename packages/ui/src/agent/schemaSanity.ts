import type { McpTool } from "@openmasq/mcp";

/**
 * Sanitize a DEGENERATE `required` in a remote MCP tool's schema.
 *
 * The measured case (journal 13/08/2026, Intercom `search_conversations`): the server
 * marks nearly all of its ~45 properties "required". The model obeys and fills in
 * EVERYTHING — `""`, `0`, `{">=", 0}` — the server turns each supplied field into a query
 * clause, and the API refuses ("composite query > 15 elements"). Six attempts, six
 * failures: unfixable from the inside, because our own corrective hint (`argErrorHint`)
 * rereads the same schema and repeats "(required)" on every field.
 *
 * The rule: when `required` covers almost every property of an object that has many, that
 * is not a constraint, it's a server-side generation bug — no search API demands 40
 * filters. So we drop the ENTIRE list: the model then only fills in the useful fields,
 * which every one of these servers accepts. A short, plausible `required` (1-7 fields)
 * is never touched.
 *
 * Pure, recursive, and identity-lazy: a healthy schema comes back as the SAME reference,
 * so nothing is copied on the nominal path.
 */

const DEGENERATE_MIN = 8; // below this, a required list is always plausible
const DEGENERATE_RATIO = 0.75; // beyond this property coverage, it's noise

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function sanitizeNode(node: unknown): unknown {
  if (!isObj(node)) return node;

  let out: Obj = node;
  const set = (key: string, value: unknown): void => {
    if (out === node) out = { ...node };
    out[key] = value;
  };

  const props = isObj(node.properties) ? node.properties : null;
  if (props && Array.isArray(node.required)) {
    const propCount = Object.keys(props).length;
    const req = node.required.filter((k): k is string => typeof k === "string");
    if (req.length >= DEGENERATE_MIN && propCount > 0 && req.length >= propCount * DEGENERATE_RATIO) {
      if (out === node) out = { ...node };
      delete out.required;
    }
  }

  if (props) {
    let nextProps: Obj = props;
    for (const [k, v] of Object.entries(props)) {
      const s = sanitizeNode(v);
      if (s !== v) {
        if (nextProps === props) nextProps = { ...props };
        nextProps[k] = s;
      }
    }
    if (nextProps !== props) set("properties", nextProps);
  }

  if (node.items !== undefined) {
    const s = sanitizeNode(node.items);
    if (s !== node.items) set("items", s);
  }

  return out;
}

/** The loop's entry point: each tool with a degenerate schema comes back with a
 *  sanitized `inputSchema`; the others come back by the same reference. */
export function sanitizeToolSchemas(tools: McpTool[]): McpTool[] {
  let changed = false;
  const out = tools.map((t) => {
    const s = sanitizeNode(t.inputSchema);
    if (s === t.inputSchema) return t;
    changed = true;
    return { ...t, inputSchema: s as McpTool["inputSchema"] };
  });
  return changed ? out : tools;
}
