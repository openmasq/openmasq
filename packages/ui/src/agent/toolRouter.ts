import type { ChatMessage, ProviderId, ToolDef, CompleteToolsResult } from "@openmasq/llm";
import type { CompleteToolsPayload } from "../host";
import { DEFAULT_ROUTING_CONFIG, type RoutingConfig } from "./routingConfig";
import { canonicalToolName } from "./toolCatalog";
import { captureEvent } from "../analytics";

/**
 * MCP tool ROUTING pre-pass. A connector like Webflow exposes dozens of tools;
 * with several connectors the full JSON schemas alone can blow past a model's
 * context window (Mistral Medium 400s: "Prompt contains 151357 tokens … too
 * large"). So before the agentic loop offers the model any tools, we ask it —
 * with a CHEAP call that carries only tool NAMES + one-line descriptions (never
 * the schemas) — which tools are actually relevant to this request, and load the
 * full schemas for that subset ONLY.
 */

type CompleteToolsFn = (p: CompleteToolsPayload) => Promise<CompleteToolsResult>;

/** A compact tool descriptor for the catalog — no JSON schema. */
export interface RouterTool {
  name: string;
  description?: string;
  serverId?: string;
}

export interface RouteToolsParams {
  tools: RouterTool[];
  /** The user's latest request (wire form — already redacted). */
  userText: string;
  complete: CompleteToolsFn;
  provider: ProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  requestId?: string;
  /** Overrides `routeDescMaxChars` (default 140). Only the eval bench sweeps this
   *  (`evals/strategies.ts`) — production never overrides it. */
  cfg?: RoutingConfig;
  /** The id of the calling loop — links the rescues to the rest of the agentic funnel. */
  loopId?: string;
}

/**
 * Is the tool set big enough that a routing round-trip is worth it? A small set
 * that comfortably fits (≤ `routeRatio` of the window AND ≤ `routeMaxTools`) is sent
 * whole — no extra latency. Anything larger gets routed so the schemas can't overflow.
 * `cfg` defaults to today's constants (0.35 / 24) — production never overrides it;
 * only the eval bench sweeps other values (`evals/strategies.ts`).
 */
export function needsRouting(
  estTokens: number,
  count: number,
  window: number,
  cfg: RoutingConfig = DEFAULT_ROUTING_CONFIG,
): boolean {
  return !(estTokens <= window * cfg.routeRatio && count <= cfg.routeMaxTools);
}

const SELECT_TOOLS: ToolDef = {
  name: "select_tools",
  description: "Renvoie les tool_names pertinents pour la demande de l'utilisateur.",
  parameters: {
    type: "object",
    properties: {
      tool_names: {
        type: "array",
        items: { type: "string" },
        description: "Les noms EXACTS des outils susceptibles d'être réellement appelés.",
      },
    },
    required: ["tool_names"],
    additionalProperties: false,
  },
};

/** One compact catalog line: `name [server] — short description`. */
function catalogLine(t: RouterTool, descMax: number): string {
  const desc = (t.description ?? "").replace(/\s+/g, " ").trim().slice(0, descMax);
  return `- ${t.name}${t.serverId ? ` [${t.serverId}]` : ""}${desc ? ` — ${desc}` : ""}`;
}

/**
 * Pick the subset of tool NAMES relevant to `userText`. Returns the intersection
 * of the model's pick with the real names (hallucinated names dropped). An empty
 * set means "no tool is needed" (a general question). THROWS on any router-call
 * failure — the caller decides the fallback (keep-all-if-it-fits / pare / error).
 */
export async function routeTools(p: RouteToolsParams): Promise<Set<string>> {
  const descMax = (p.cfg ?? DEFAULT_ROUTING_CONFIG).routeDescMaxChars;
  const real = new Set(p.tools.map((t) => t.name));
  const catalog = p.tools.map((t) => catalogLine(t, descMax)).join("\n");
  const system =
    "Tu es un routeur d'outils. Voici le catalogue des outils connecteurs disponibles " +
    "(nom [serveur] — description) :\n" +
    catalog +
    "\n\nÀ partir de la demande de l'utilisateur, appelle select_tools avec UNIQUEMENT les " +
    "tool_names susceptibles d'être RÉELLEMENT appelés pour y répondre — exclus entièrement " +
    "les connecteurs sans rapport. Une demande peut couvrir plusieurs connecteurs : inclus " +
    "alors les outils de chacun. Si la demande n'appelle aucun outil (question générale, " +
    "discussion, définition), renvoie une liste vide.";
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: p.userText.trim() || "(demande vide)" },
  ];

  const res = await p.complete({
    provider: p.provider,
    model: p.modelId,
    messages,
    tools: [SELECT_TOOLS],
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    requestId: p.requestId,
    toolChoice: "required",
  });

  // UNREADABLE ≠ "no tool required". A malformed JSON from the router model (`argsError`),
  // a response with no call, or a `tool_names` that isn't a list all used to read as a
  // LEGITIMATE empty pick — the model went on with zero connector tools and
  // improvised blindly (measured: 85 empty picks/30 days, all models). Only an EXPLICIT
  // `[]` list means "no tool"; the unreadable case is SURFACED, typed, so the caller
  // can choose its fallback (keep-all-if-it-fits) WITHOUT arming the configuration cooldown.
  const call = res.toolCalls.find((c) => c.name === "select_tools") ?? res.toolCalls[0];
  if (!call) throw new RouterUnreadableError("réponse sans appel select_tools");
  if (call.argsError) throw new RouterUnreadableError(`arguments illisibles : ${call.argsError}`);
  const picked = call.arguments?.tool_names;
  if (!Array.isArray(picked)) throw new RouterUnreadableError("tool_names absent ou non-liste");

  // Two rescues on the retained names, BEFORE discarding: the BARE name (`search_conversations`
  // with no prefix — same resolution as the dispatch, a single candidate or none), and the
  // CONNECTOR-level pick (« intercom » — the router sometimes answers with the whole service).
  // The silent exact intersection used to drop both, and an otherwise correct pick went empty.
  const byPrefix = new Map<string, string[]>();
  for (const n of real) {
    const i = n.indexOf("__");
    if (i <= 0) continue;
    const list = byPrefix.get(n.slice(0, i)) ?? [];
    list.push(n);
    byPrefix.set(n.slice(0, i), list);
  }
  const keep = new Set<string>();
  let bareNames = 0;
  let connectorPicks = 0;
  for (const rawName of picked) {
    if (typeof rawName !== "string") continue;
    const n = rawName.trim();
    if (real.has(n)) {
      keep.add(n);
      continue;
    }
    const canon = canonicalToolName(n, real);
    if (canon !== n) {
      keep.add(canon);
      bareNames += 1;
      continue;
    }
    const connectorTools = byPrefix.get(n);
    if (connectorTools) {
      for (const t of connectorTools) keep.add(t);
      connectorPicks += 1;
    }
  }
  if (bareNames) captureEvent({ name: "tool_route_salvage", kind: "bare_name", count: bareNames, provider: p.provider, model: p.modelId, loopId: p.loopId });
  if (connectorPicks) captureEvent({ name: "tool_route_salvage", kind: "connector_pick", count: connectorPicks, provider: p.provider, model: p.modelId, loopId: p.loopId });
  return keep;
}

/** The router's response could NOT be READ — distinct from an empty pick (legitimate) and
 *  from a transport/configuration failure (which DOES arm the cooldown). */
export class RouterUnreadableError extends Error {}

// ── Router cooldown ──────────────────────────────────────────────────────────
// A router failure is usually CONFIGURATION (the router's provider unreachable —
// e.g. a platform 401), not a transient blip: without memory the loop burned one
// dead round-trip (~0.5 s + journal noise) on EVERY send. Module-level TTL; `now`
// injected so the logic stays pure/testable. Success clears it immediately.
const ROUTER_COOLDOWN_MS = 5 * 60_000;
let routerBrokenUntil = 0;

/** True while a recent router failure should skip straight to the deterministic pare. */
export function routerCooldownActive(now: number): boolean {
  return now < routerBrokenUntil;
}
export function noteRouterFailure(now: number): void {
  routerBrokenUntil = now + ROUTER_COOLDOWN_MS;
}
export function noteRouterSuccess(): void {
  routerBrokenUntil = 0;
}
