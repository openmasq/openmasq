/**
 * LIVE-DERIVED operation resolver for "API" MCP connectors (Stripe, and any
 * connector that exposes an operation-DISCOVERY tool + an operation-WRITE tool
 * keyed by an `operationId`).
 *
 * The problem it solves: `stripe_api_search` doesn't surface the *update* operation
 * under an "update" intent, so a model can't find `PostCustomersCustomer` and either
 * loops or wrongly falls back to CREATE. A hardcoded `{action → operationId}` map
 * would fix that but would DRIFT the moment the provider renames/reversions an
 * operation. So instead we DERIVE the operationId every time, purely from the live
 * discovery output: parse whatever operations the connector returns, then pick the
 * one matching the desired action by REST convention (HTTP method + whether the path
 * targets a specific instance `/{id}`). The operationId is ALWAYS whatever the live
 * spec says — nothing about it is baked here. Provider-agnostic, drift-free, pure
 * (the one side effect — running the discovery tool — is an injected callback).
 */

export interface ApiOperation {
  /** The exact operationId to pass to the write tool — verbatim from live output. */
  operationId: string;
  /** HTTP method, upper-cased. */
  method: string;
  /** URL path, e.g. `/v1/customers/{customer}`. */
  path: string;
  /** One-line summary, when the discovery output includes it. */
  summary?: string;
}

// A discovery result block: `## <operationId>` then a `METHOD /path` line then an
// optional summary line. Matches the Stripe `stripe_api_search` text format and the
// common OpenAPI-listing shape; tolerant of leading `#`/`##`/`###` and indentation.
const HEADER = /^#{1,3}\s+(\S+)\s*$/;
const METHOD_PATH = /^\s*(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)/i;

/** Parse a discovery tool's TEXT output into structured operations. Pure. */
export function parseOperations(text: string): ApiOperation[] {
  const ops: ApiOperation[] = [];
  let cur: Partial<ApiOperation> | null = null;
  const flush = () => {
    if (cur?.operationId && cur.method && cur.path) ops.push(cur as ApiOperation);
    cur = null;
  };
  for (const line of (text ?? "").split("\n")) {
    const h = line.match(HEADER);
    if (h) {
      flush();
      cur = { operationId: h[1] };
      continue;
    }
    if (!cur) continue;
    const mp = line.match(METHOD_PATH);
    if (mp && !cur.method) {
      cur.method = mp[1].toUpperCase();
      cur.path = mp[2];
      continue;
    }
    if (cur.method && !cur.summary) {
      const t = line.trim();
      if (t) cur.summary = t;
    }
  }
  flush();
  return ops;
}

/** Which HTTP methods can realise each action (REST convention; Stripe uses POST
 *  for both create and update, disambiguated by the path shape below). */
const ACTION_METHODS: Record<string, string[]> = {
  create: ["POST"],
  update: ["POST", "PUT", "PATCH"],
  modify: ["POST", "PUT", "PATCH"],
  edit: ["POST", "PUT", "PATCH"],
  delete: ["DELETE"],
  remove: ["DELETE"],
  read: ["GET"],
  retrieve: ["GET"],
  get: ["GET"],
  list: ["GET"],
};

/** Map a free-form intent PHRASE (what the model passes, e.g. "update customer
 *  name") to a canonical action verb, or null if none is recognised. */
export function normalizeAction(s: string): string | null {
  const t = (s || "").toLowerCase();
  if (/updat|modif|edit|patch|chang|renam|\bset\b/.test(t)) return "update";
  if (/creat|\badd\b|\bnew\b|insert/.test(t)) return "create";
  if (/delet|remov|destroy/.test(t)) return "delete";
  if (/retriev|fetch|\bget\b|\bread\b|show|detail/.test(t)) return "retrieve";
  if (/\blist\b|search|find|\ball\b/.test(t)) return "list";
  return null;
}

/** Does the path target a SPECIFIC instance (ends in a `/{param}` segment)? */
const targetsInstance = (path: string) => /\/\{[^}]+\}\/?$/.test(path);

/**
 * Pick the operation matching `action` from a set of LIVE operations, by REST
 * convention only:
 *  - create / list → collection-level (path has NO trailing `/{id}`)
 *  - update / modify / edit / read / retrieve / delete → instance-level (`/{id}`)
 * Returns null when no operation of the right method exists. Pure.
 */
export function pickOperation(ops: ApiOperation[], action: string): ApiOperation | null {
  const a = normalizeAction(action) ?? action.toLowerCase();
  const methods = ACTION_METHODS[a];
  if (!methods) return null;
  const byMethod = ops.filter((o) => methods.includes(o.method));
  if (!byMethod.length) return null;
  const wantsInstance = a !== "create" && a !== "list";
  const preferred = byMethod.find((o) => targetsInstance(o.path) === wantsInstance);
  return preferred ?? byMethod[0];
}

export type DiscoverFn = (query: { intent: string; resource: string }) => Promise<string>;

/** Discovery intents to try, broadest-useful first. Even when a direct "update"
 *  search returns nothing, a "retrieve"/resource-level search often lists the
 *  instance operations (incl. the update) which `pickOperation` then selects. */
function defaultIntents(action: string, resource: string): string[] {
  const a = normalizeAction(action) ?? action.toLowerCase();
  // Try the model's original phrase first, then verb-based + read/list probes.
  const base = [action, `${a} ${resource}`, `${a} a ${resource}`];
  // For a write action, also probe read/list — they tend to return the instance
  // path/operations the write shares, letting us pick the write op by method+path.
  const extra =
    a === "create" || a === "list"
      ? [`list ${resource}`, resource]
      : [`retrieve ${resource}`, `get ${resource}`, `list ${resource}`, resource];
  return [...new Set([...base, ...extra])];
}

/**
 * Resolve `action` on `resource` to a concrete operation, LIVE. Runs the connector's
 * own discovery tool (injected `discover`) with progressively broader intents,
 * accumulating whatever operations come back, and returns the first pick that
 * matches. Returns null if discovery never yields a usable operation (the caller
 * then falls back to the existing self-correction path). A discovery call that throws
 * is skipped, not fatal. NOTHING about the operationId is hardcoded — it is read
 * verbatim from the live output, so there is no drift when the provider changes.
 */
export async function resolveOperation(
  discover: DiscoverFn,
  opts: { resource: string; action: string; intents?: string[]; maxCalls?: number },
): Promise<ApiOperation | null> {
  const intents = opts.intents ?? defaultIntents(opts.action, opts.resource);
  const cap = opts.maxCalls ?? intents.length;
  const seen = new Map<string, ApiOperation>();
  for (const intent of intents.slice(0, cap)) {
    let text: string;
    try {
      text = await discover({ intent, resource: opts.resource });
    } catch {
      continue;
    }
    for (const op of parseOperations(text)) seen.set(op.operationId, op);
    const pick = pickOperation([...seen.values()], opts.action);
    if (pick) return pick;
  }
  return null;
}
