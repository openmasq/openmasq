import { connectorIdFromInstance, findConnector } from "@openmasq/catalog/mcp";
import type { ToolDef } from "@openmasq/llm";
import type { McpTool } from "@openmasq/mcp";
import { DEFAULT_CATALOG_CONFIG, type CatalogConfig } from "./routingConfig";

/**
 * Tool AWARENESS (vs callability). The routing pre-pass loads full JSON schemas
 * only for the tools relevant to a request — but the model must still KNOW the
 * full connected surface (to answer "que peux-tu faire ?" and to reach a tool
 * the router dropped). This module builds a CHEAP catalog (names + one-line
 * descriptions, never schemas) injected into the system prompt, plus a
 * `load_tools` meta-tool the model calls to pull a not-yet-loaded tool's schema
 * on demand. Awareness = the catalog (always, when pruned); callability = the
 * loaded schemas (pruned) + whatever `load_tools` adds.
 */

export const toolDefOf = (t: McpTool): ToolDef => ({
  name: t.name,
  description: t.description,
  parameters: t.inputSchema,
});

/** Rough token estimate of a tool set's JSON schemas (~4 chars/token). The
 *  schemas dominate a tool-calling prompt, so this gates the routing pre-pass. */
export const estToolTokens = (tools: McpTool[]): number =>
  Math.ceil(JSON.stringify(tools.map(toolDefOf)).length / 4);

/** Deterministic fallback when routing fails: keep everything if it fits `fitBudgetRatio`
 *  of the window AND at most `fitMaxTools` tools, else drop the most VERBOSE schemas
 *  first until BOTH hold. The count cap matters on its own: a huge-context model can
 *  comfortably FIT hundreds of full schemas under the ratio, and "fits" is not "good" —
 *  measured 2026-07-30 (a router failure cascaded into 283/283 tools offered, 372k
 *  tokens, for a task needing one). Preserves the original order of what's kept. `cfg`
 *  defaults to today's constants — only the eval bench sweeps other values
 *  (`evals/strategies.ts`). */
export function fitToBudget(all: McpTool[], win: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): McpTool[] {
  const budget = win * cfg.fitBudgetRatio;
  const fits = (set: McpTool[]): boolean => set.length <= cfg.fitMaxTools && estToolTokens(set) <= budget;
  if (fits(all)) return all;
  const bySize = [...all].sort(
    (a, b) => JSON.stringify(toolDefOf(b)).length - JSON.stringify(toolDefOf(a)).length,
  );
  const drop = new Set<McpTool>();
  for (const t of bySize) {
    if (fits(all.filter((x) => !drop.has(x)))) break;
    drop.add(t);
  }
  return all.filter((t) => !drop.has(t));
}

const DESC_MAX = 120;

const line = (t: McpTool, descMax: number = DESC_MAX): string => {
  const d = (t.description ?? "").replace(/\s+/g, " ").trim().slice(0, descMax);
  return `- ${t.name}${d ? ` — ${d}` : ""}`;
};

/** The connector a tool belongs to, for grouping. The RedactingMcpClient sets
 *  every tool's `serverId` to the transport connection id (`"ipc"`), so the real
 *  connector lives in the namespaced NAME prefix (`webflow__list_pages`). Prefer
 *  that; fall back to serverId, then "mcp". */
const groupKey = (t: McpTool): string => {
  const i = t.name.indexOf("__");
  // Normalise a multi-account instance prefix ("gmail--a1b2") to its brand ("gmail")
  // so all accounts of a connector group under one `## gmail` heading.
  return i > 0 ? connectorIdFromInstance(t.name.slice(0, i)) : (t.serverId ?? "mcp");
};

/** A compact, capped catalog of EVERY connected tool, grouped by connector:
 *  `## {connector}\n- {name} — {desc}`. When over the char budget (`cfg.catalogMaxChars`,
 *  see `DEFAULT_CATALOG_CONFIG` in `routingConfig.ts`), each group is capped and a
 *  `… (+N autres outils sur {connector})` note is appended so nothing is silently hidden.
 *  NEVER includes JSON schemas. `cfg` defaults to today's shipped budget — only the eval
 *  bench sweeps other values (`evals/strategies.ts`). */
export function toolCatalog(tools: McpTool[], cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): string {
  const byServer = new Map<string, McpTool[]>();
  for (const t of tools) {
    const k = groupKey(t);
    let arr = byServer.get(k);
    if (!arr) {
      arr = [];
      byServer.set(k, arr);
    }
    arr.push(t);
  }
  const servers = [...byServer.entries()];
  /** What a connector CANNOT do here, when the catalog says so (`byoAdds`: the capability
   *  the user's own keys would unlock). Stated with the tools, because the absence of a
   *  tool does not read as a limit — the model treats a missing name as one it has not
   *  learnt yet and invents it. Journal 27/07/2026: `gmail__list_messages` called
   *  twice, including AFTER `load_tools` had answered `send_email` and nothing else —
   *  for lack of reading it, the model ended up SENDING. */
  const limit = (connectorId: string): string => {
    const c = findConnector(connectorId);
    return c?.byoAdds ? `_(non disponible ici : ${c.byoAdds} — demande les clés de l'utilisateur)_` : "";
  };
  const block = (s: string, lines: string[]): string => {
    const l = limit(s);
    // « Aucun autre » holds for EVERY connector: it's the phrase that cuts short
    // inventing a plausible name, and it's true by construction.
    return `## ${s}${l ? ` ${l}` : ""}\n${lines.join("\n")}\n_(aucun autre outil sur ${s})_`;
  };

  const full = servers.map(([s, ts]) => block(s, ts.map((t) => line(t, cfg.descMaxChars)))).join("\n\n");
  if (full.length <= cfg.catalogMaxChars) return full;

  // Over budget → give each connector an equal char share; fill lines until it's
  // used (keeping ≥3), then note how many were hidden. Keeps the total ≲ budget.
  const share = Math.floor(cfg.catalogMaxChars / servers.length);
  return servers
    .map(([s, ts]) => {
      const lines: string[] = [];
      let used = s.length + 5;
      let shown = 0;
      for (const t of ts) {
        const l = line(t, cfg.descMaxChars);
        if (shown >= 3 && used + l.length + 1 > share) break;
        lines.push(l);
        used += l.length + 1;
        shown++;
      }
      const extra = ts.length - shown;
      if (extra > 0) lines.push(`… (+${extra} autres outils sur ${s})`);
      return block(s, lines);
    })
    .join("\n\n");
}

/** The internal meta-tool the model calls to pull a not-yet-loaded tool's schema.
 *  Handled in the agentic loop (never proxied to an MCP server). */
export const LOAD_TOOLS_DEF: ToolDef = {
  name: "load_tools",
  description:
    "Charge les schémas d'outils du catalogue pas encore disponibles à l'appel, pour pouvoir les appeler au tour suivant. Accepte soit un NOM DE CONNECTEUR (ex: \"webflow\") pour charger tous ses outils, soit des noms d'outils précis.",
  parameters: {
    type: "object",
    properties: {
      tool_names: {
        type: "array",
        items: { type: "string" },
        description:
          "Noms de connecteurs (ex: \"webflow\", \"vercel\") pour charger tous leurs outils, ou noms d'outils EXACTS du catalogue.",
      },
    },
    required: ["tool_names"],
    additionalProperties: false,
  },
};

/**
 * The CANONICAL tool name, as advertised — `browser_navigate` →
 * `browser__browser_navigate`.
 *
 * ⚠️ Why this isn't cosmetic. `RedactingMcpClient.callTool` already TOLERATES a
 * model dropping the `${connector}__` prefix: it routes to the one advertised tool
 * whose bare name matches, and the call succeeds. But EVERY decision in the loop
 * is keyed on the name the MODEL wrote — the connector, the result's redaction
 * policy, `isGovernedWebTool`, `skipsArgExfilScan`, the idempotency key. A bare name
 * makes all of them get the connector wrong, silently, on a call that nonetheless succeeded.
 *
 * Measured (27/07/2026 journal): the model calls `browser_navigate` with no prefix (the
 * browser wasn't even in the offer — the router hadn't kept it and
 * `looksWebIntent` hadn't triggered on « fait des recherches sur Vera »).
 * `isGovernedWebTool` then answers `false`, so NO clear mode: the full engine
 * runs on a public DuckDuckGo results page and vaults 62 entities, including « Vera »
 * — a word that was in CLEAR in the user's message. Any URL containing that word
 * then becomes « porteuse de données de conversation » and the exploration stops dead.
 *
 * Resolution is the client's, identically: a name already advertised is returned
 * as-is, otherwise only a SINGLE candidate is accepted. The model's name therefore
 * CONFERS nothing — it only designates an entry in our own table (rule 7).
 */
export function canonicalToolName(name: string, advertised: Iterable<string>): string {
  const all = [...advertised];
  if (all.includes(name)) return name;
  const suffix = `__${name}`;
  const hits = all.filter((n) => n.endsWith(suffix));
  return hits.length === 1 ? hits[0] : name;
}

/**
 * Resolve a `load_tools` call: from the requested names, decide which tool
 * schemas to ADD given the FULL surface (`full`), what's ALREADY loaded
 * (`loaded`) and the context `budget` (chars-equivalent token ceiling). Pure —
 * the caller applies the returned `add` to its live toolDefs/toolInfo. Returns a
 * model-facing result string listing loaded / unknown / skipped names.
 */
export function resolveLoadTools(
  rawNames: unknown,
  full: Map<string, McpTool>,
  loaded: Map<string, McpTool>,
  budgetTokens: number,
): { add: McpTool[]; content: string } {
  const names = Array.isArray(rawNames)
    ? rawNames.filter((n): n is string => typeof n === "string" && n.length > 0)
    : [];
  const add: McpTool[] = [];
  const unknown: string[] = [];
  const skipped: string[] = [];
  const already: string[] = [];
  const current = [...loaded.values()];

  // A tool's connector = the name prefix before "__" (webflow__data_sites_tool →
  // "webflow"). Models naturally pass the CONNECTOR name ("webflow") to load_tools,
  // not the exact tool names, so accept both: a connector name loads all its tools.
  const connectorOf = (name: string): string => {
    const i = name.indexOf("__");
    return i > 0 ? connectorIdFromInstance(name.slice(0, i)) : "";
  };
  const byConnector = new Map<string, McpTool[]>();
  for (const t of full.values()) {
    const c = connectorOf(t.name);
    if (c) byConnector.set(c, [...(byConnector.get(c) ?? []), t]);
  }

  // Try to add one tool; returns whether it was added / already / skipped (budget).
  const tryAdd = (t: McpTool): "added" | "already" | "skipped" => {
    if (loaded.has(t.name) || add.some((x) => x.name === t.name)) return "already";
    if (estToolTokens([...current, ...add, t]) > budgetTokens) return "skipped";
    add.push(t);
    return "added";
  };

  for (const n of names) {
    const exact = full.get(n);
    if (exact) {
      const r = tryAdd(exact);
      if (r === "already") already.push(n);
      else if (r === "skipped") skipped.push(n);
      continue;
    }
    const conn = [...byConnector.keys()].find((c) => c.toLowerCase() === n.toLowerCase());
    if (conn) {
      for (const t of byConnector.get(conn)!) {
        const r = tryAdd(t);
        if (r === "already") already.push(t.name);
        else if (r === "skipped") skipped.push(t.name);
      }
      continue;
    }
    unknown.push(n);
  }
  const loadedStr = add.map((t) => t.name).join(", ") || (already.length ? "déjà chargés" : "aucun");
  const parts = [`Schémas chargés : ${loadedStr}.`];
  if (unknown.length) {
    parts.push(`Inconnus : ${unknown.join(", ")}.`);
    // Name the connectors that ACTUALLY exist so a weak model that invented one
    // (e.g. asking to load "tavily" when only browser/canva are connected) pivots to
    // a real capability instead of re-requesting the same phantom name every turn.
    const available = [...byConnector.keys()].sort();
    if (available.length) {
      let hint = `N'invente pas de connecteur. Connecteurs réellement disponibles : ${available.join(", ")}.`;
      if (available.includes("browser"))
        hint += ` Pour chercher/consulter le web, utilise « browser » (browser__browser_navigate), pas un outil de recherche externe.`;
      parts.push(hint);
    }
  }
  if (skipped.length) parts.push(`Ignorés (trop volumineux pour le contexte) : ${skipped.join(", ")}.`);
  return { add, content: parts.join(" ") };
}

/* ── Arg-error self-correction ──────────────────────────────────────────────
 * When a model malforms a tool call (esp. tools with nested `actions[]` like
 * Webflow), feed back a BOUNDED outline of the expected parameters — and, on a
 * repeat failure, a minimal valid-shaped example — so a weaker model can fix its
 * call instead of giving up. Pure + deterministic; never dumps the raw schema. */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: unknown;
  items?: unknown;
  enum?: unknown[];
  description?: string;
}

const asSchema = (v: unknown): JsonSchema | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonSchema) : null;

const firstType = (s: JsonSchema): string | undefined =>
  Array.isArray(s.type) ? s.type[0] : s.type;

function typeLabel(s: JsonSchema): string {
  const t = firstType(s);
  if (t === "array") {
    const it = asSchema(s.items);
    return `array<${it ? typeLabel(it) : "any"}>`;
  }
  return t ?? "any";
}

/**
 * Render a JSON-Schema `parameters` object as a concise, model-friendly outline
 * of the EXPECTED arguments: `name: type` (+ `(requis)`, + `{a|b|c}` for a small
 * string enum, + a ≤80-char description). Recurses into nested object /
 * array<object> up to `maxDepth` (default 2). HARD-capped at `maxChars` (default
 * 1200 ≈ 300 tokens) with a trailing `…`. Returns "" for a non-object / missing /
 * property-less schema so the caller skips the hint.
 */
export function describeToolParams(
  schema: unknown,
  opts: { maxDepth?: number; maxChars?: number } = {},
): string {
  const maxDepth = opts.maxDepth ?? 2;
  const maxChars = opts.maxChars ?? 1200;
  const root = asSchema(schema);
  const rootProps = root && asSchema(root.properties);
  if (!root || !rootProps) return "";

  const lines: string[] = [];
  const walk = (s: JsonSchema, depth: number, indent: string): void => {
    const props = asSchema(s.properties);
    if (!props) return;
    const required = new Set(
      Array.isArray(s.required) ? s.required.filter((k): k is string => typeof k === "string") : [],
    );
    for (const [key, raw] of Object.entries(props as Record<string, unknown>)) {
      const ps = asSchema(raw);
      if (!ps) continue;
      let l = `${indent}${key}: ${typeLabel(ps)}`;
      if (required.has(key)) l += " (requis)";
      if (Array.isArray(ps.enum) && ps.enum.length && ps.enum.length <= 12) {
        const vals = ps.enum.filter((v): v is string => typeof v === "string").slice(0, 12);
        if (vals.length) l += ` — {${vals.join("|")}}`;
      }
      if (typeof ps.description === "string" && ps.description.trim()) {
        l += ` — ${ps.description.replace(/\s+/g, " ").trim().slice(0, 80)}`;
      }
      lines.push(l);
      if (depth < maxDepth) {
        const t = firstType(ps);
        if (t === "object" && asSchema(ps.properties)) walk(ps, depth + 1, indent + "  ");
        else if (t === "array") {
          const it = asSchema(ps.items);
          if (it && asSchema(it.properties)) walk(it, depth + 1, indent + "  ");
        }
      }
    }
  };
  walk(root, 0, "");
  const out = lines.join("\n");
  return out.length > maxChars ? out.slice(0, maxChars - 1) + "…" : out;
}

/**
 * A smallest valid-SHAPED value for a JSON schema: required props only, filled
 * with type-appropriate placeholders (string→"…", number→0, boolean→false,
 * array→[one item], object→recurse). Depth-bounded (default 3). Pure.
 */
export function exampleFromSchema(schema: unknown, maxDepth = 3, depth = 0): unknown {
  const s = asSchema(schema);
  if (!s) return "…";
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  const t = firstType(s) ?? (asSchema(s.properties) ? "object" : undefined);
  switch (t) {
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array": {
      if (depth >= maxDepth) return [];
      const it = asSchema(s.items);
      return it ? [exampleFromSchema(it, maxDepth, depth + 1)] : [];
    }
    case "object": {
      const props = asSchema(s.properties);
      if (depth >= maxDepth || !props) return {};
      const keys = Array.isArray(s.required)
        ? s.required.filter((k): k is string => typeof k === "string")
        : Object.keys(props as Record<string, unknown>).slice(0, 4);
      const obj: Record<string, unknown> = {};
      for (const k of keys) {
        const ps = (props as Record<string, unknown>)[k];
        if (ps !== undefined) obj[k] = exampleFromSchema(ps, maxDepth, depth + 1);
      }
      return obj;
    }
    default:
      return "…";
  }
}

/**
 * The corrective hint appended to an ARGUMENT-error tool result: the expected
 * params outline, plus (from the 2nd failure of the same tool, `attempt >= 2`) a
 * minimal example call. Returns "" when the schema has no describable params, so
 * the caller appends nothing. Kept here so the agent loop stays a few lines.
 */
export function argErrorHint(toolName: string, schema: unknown, attempt: number): string {
  const outline = describeToolParams(schema);
  if (!outline) return "";
  let hint =
    `\n\nParamètres attendus pour ${toolName} :\n${outline}\n\n` +
    "Corrige tes arguments pour respecter EXACTEMENT ce schéma (structure, noms, types), puis rappelle l'outil.";
  if (attempt >= 2) {
    hint += `\n\nExemple d'appel minimal valide :\n${JSON.stringify(exampleFromSchema(schema), null, 2)}`;
  }
  return hint;
}

/**
 * Hint for when the model called an INVENTED tool (a name not in the connected
 * surface — e.g. a weak model guessing `tavily__search` when only browser/canva are
 * connected). `argErrorHint` is empty for such a tool (no schema), and the raw
 * "Unknown MCP tool … Available tools: <50 names>" dump is noise a weak model can't
 * parse — so name the CONNECTORS that actually exist (+ browser for web) so it stops
 * re-calling a phantom and picks a real capability.
 */
export function unknownToolHint(full: Map<string, McpTool>): string {
  const connectors = [
    ...new Set(
      [...full.keys()]
        .map((n) => {
          const i = n.indexOf("__");
          return i > 0 ? connectorIdFromInstance(n.slice(0, i)) : "";
        })
        .filter(Boolean),
    ),
  ].sort();
  if (!connectors.length) return "\n\nCet outil n'existe pas et aucun connecteur n'est disponible.";
  let hint =
    `\n\nCet outil n'existe pas — n'invente pas d'outil. Connecteurs réellement disponibles : ` +
    `${connectors.join(", ")}. Charge les outils de l'un d'eux via \`load_tools\` (avec le nom du connecteur), puis appelle un de SES outils.`;
  if (connectors.includes("browser"))
    hint += ` Pour chercher/consulter le web, utilise « browser », pas un service de recherche externe.`;
  return hint;
}
