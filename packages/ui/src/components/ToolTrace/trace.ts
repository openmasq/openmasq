import { findConnector } from "@openmasq/catalog/mcp";

/** One persisted tool call on an assistant message (see `Message.toolCalls`). */
export interface ToolCallRecord {
  tool: string;
  server: string;
  ok: boolean;
  /** The user DECLINED this write (confirmation card) — not a failure.
   *  ⚠️ Declining is a SUCCESS of the guard-rail: without this field, the decline carried
   *  a bare `ok:false` and the bubble concluded « une étape du flux a échoué » with
   *  a Réessayer button — the app scolded the user for having said no (noted 14/08). */
  declined?: boolean;
  summary?: string;
  /** One-line human narration of the call (LLM-generated, already un-redacted). */
  note?: string;
  /** Round-trip duration in ms — shows where a long turn's time went. */
  ms?: number;
}

/** A tool row inside a connector card, with its visual state. */
export interface TraceTool {
  name: string;
  summary?: string;
  /** One-line human narration of the call (shown as the row's descriptor). */
  note?: string;
  state: "done" | "error" | "running" | "declined";
  /** Total round-trip time across the row's collapsed attempts, in ms. */
  ms?: number;
  /** How many CONSECUTIVE calls to this tool were collapsed into this row (≥1). */
  attempts?: number;
  /** How many of those attempts failed — drives the discreet "N échecs" hint so a
   *  retry loop is one row, not a wall of "échec" lines. */
  failures?: number;
}

/** One connector card in the workflow trace (a `WorkflowTrace` run). */
export interface TraceRun {
  serverId: string;
  /** Connector display name (e.g. "Linear"), from the catalog or the id. */
  name: string;
  /** Two-letter glyph shown in the tile (e.g. "LI"). */
  glyph: string;
  /** Design-system hue name (`--hl-{tone}`), e.g. "violet". */
  tone: string;
  /** The BASE catalog connector id (instance suffix stripped), for a real-logo
   *  lookup (`MCP_LOGOS`/`MCP_LOGO_IMAGES`). Absent for builtins (browser/python). */
  connectorId?: string;
  /** A BUILT-IN, intercepted tool (e.g. the code interpreter) — NOT an MCP
   *  connector, so its card drops the "MCP" badge. */
  builtin: boolean;
  tools: TraceTool[];
}

/** BUILT-IN, intercepted tools (never proxied to an MCP server) get their OWN
 *  friendly card presentation — no "MCP" badge — keyed by a canonical pseudo-server
 *  so the LIVE trace (`run_python`) and the PERSISTED trace (`server:"python"`, set
 *  in `mcpAgent`) group into ONE card instead of two mislabelled ones
 *  ("PythonMCP" vs "McpMCP"). */
const BUILTIN: Record<string, { name: string; glyph: string; tone: string }> = {
  // The sandboxed code interpreter (`run_python`) — surfaced to the user as a
  // data/plotting service, never as "Python"/"Mcp".
  python: { name: "Analyse & graphiques", glyph: "AG", tone: "lime" },
  // the app's OWN integrated browser: builtin so the card drops the "MCP" badge
  // ("NavigateurMCP" read as one word) and skips the letters-glyph ("NA") — the
  // ToolTrace renders a real browser icon for this serverId instead.
  browser: { name: "Navigateur", glyph: "", tone: "sky" },
  // The intercepted BATCH URL reader (`web_fetch_many`). Without this entry it fell to
  // the generic connector presentation and the card read « Web » + the « connecteur »
  // badge over a « WE » tile — telling the user they had connected a Web connector that
  // does not exist and that they never authorised. It reads the open web, so it wears the
  // browser's icon and tone; it is NOT the agent browser (no page, no session, no acting).
  web: { name: "Lecture web", glyph: "", tone: "sky" },
};

/** The canonical pseudo-server for a bare BUILT-IN tool NAME, else null. Keeps the
 *  live `pendingTool` grouping in sync with the persisted `server` value. */
function builtinServerForTool(tool: string): string | null {
  return tool === "run_python" ? "python" : null;
}

const HUES = new Set(["pink", "sky", "violet", "mint", "lime", "amber"]);

/** A 2-letter glyph for a connector: its internal capitals (GitHub → "GH") else
 *  its first two letters, always upper-cased. */
function glyphOf(name: string): string {
  const caps = name.match(/[A-Z0-9]/g);
  if (caps && caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  const letters = name.replace(/[^a-zA-Z0-9]/g, "");
  return (letters.slice(0, 2) || "MC").toUpperCase();
}

/** Display metadata for a connector id — name/glyph/tone from the single-source
 *  catalog, with a safe fallback for local/unknown servers. */
export function connectorPresentation(serverId: string): {
  name: string;
  glyph: string;
  tone: string;
  connectorId?: string;
  builtin: boolean;
} {
  const b = BUILTIN[serverId];
  if (b) return { name: b.name, glyph: b.glyph, tone: b.tone, builtin: true };
  const c = findConnector(serverId);
  const name = c?.name ?? (serverId.charAt(0).toUpperCase() + serverId.slice(1));
  const tone = c?.tone && HUES.has(c.tone) ? c.tone : "violet";
  return { name, glyph: glyphOf(name), tone, connectorId: c?.id ?? serverId, builtin: false };
}

/** Split a namespaced tool name into its connector id + bare tool name
 *  (`linear__list_issues` → `{ server: "linear", tool: "list_issues" }`). */
export function splitToolName(name: string): { server: string; tool: string } {
  const i = name.indexOf("__");
  if (i > 0) return { server: name.slice(0, i), tool: name.slice(i + 2) };
  // A bare name is either a BUILT-IN tool (→ its canonical pseudo-server, so the
  // live row groups with the persisted card) or an unknown, under generic "mcp".
  return { server: builtinServerForTool(name) ?? "mcp", tool: name };
}

/**
 * Collapse CONSECUTIVE calls to the SAME tool into a single row, so a retry loop
 * (e.g. a model hammering `search_stripe_resources` until it works) shows as ONE
 * line reflecting the FINAL outcome + a discreet attempt count — not a wall of
 * "échec" rows. The row takes the best outcome reached (running > succeeded >
 * failed) and the successful call's summary; `attempts`/`failures` drive the hint.
 */
function collapseRuns(tools: TraceTool[]): TraceTool[] {
  const out: TraceTool[] = [];
  for (const t of tools) {
    const prev = out[out.length - 1];
    if (prev && prev.name === t.name && prev.state !== "running") {
      prev.attempts = (prev.attempts ?? 1) + 1;
      // A collapsed row's duration is the SUM over its attempts — the honest
      // answer to "where did the time go" for a retry loop.
      if (t.ms != null) prev.ms = (prev.ms ?? 0) + t.ms;
      if (t.state === "error") {
        prev.failures = (prev.failures ?? 0) + 1;
        // A real failure overrides a past decline: it's the one that's
        // actionable (the « Réessayer » banner must come back).
        if (prev.state === "declined") prev.state = "error";
      }
      if (t.state === "running") {
        prev.state = "running";
        prev.summary = undefined;
      } else if (t.state === "done") {
        prev.state = "done";
        prev.summary = t.summary;
        prev.note = t.note;
      }
      // else error → keep the row's current (best) state; just tally the failure.
    } else {
      out.push({ ...t, attempts: 1, failures: t.state === "error" ? 1 : 0 });
    }
  }
  return out;
}

/**
 * Group an assistant turn's persisted tool calls into connector cards, in
 * first-appearance order. `pendingTool` (the namespaced name of the call
 * currently in flight) is appended as a "running" row so the LIVE trace shows the
 * in-progress step; omit it for a finished/persisted trace. Consecutive repeats
 * of the same tool are collapsed (see {@link collapseRuns}).
 */
export function groupToolCalls(
  calls: ToolCallRecord[] | undefined,
  pendingTool?: string | null,
): TraceRun[] {
  const runs: TraceRun[] = [];
  const byServer = new Map<string, TraceRun>();
  const runFor = (serverId: string): TraceRun => {
    let run = byServer.get(serverId);
    if (!run) {
      const p = connectorPresentation(serverId);
      run = { serverId, name: p.name, glyph: p.glyph, tone: p.tone, connectorId: p.connectorId, builtin: p.builtin, tools: [] };
      byServer.set(serverId, run);
      runs.push(run);
    }
    return run;
  };

  for (const call of calls ?? []) {
    runFor(call.server).tools.push({
      name: call.tool,
      summary: call.summary,
      note: call.note,
      ms: call.ms,
      state: call.ok ? "done" : call.declined ? "declined" : "error",
    });
  }

  if (pendingTool) {
    const { server, tool } = splitToolName(pendingTool);
    runFor(server).tools.push({ name: tool, state: "running" });
  }

  for (const run of runs) run.tools = collapseRuns(run.tools);
  return runs;
}

/**
 * Where a LIVE turn currently stands: the last step of the last card, and only while
 * no call is in flight.
 *
 * That gap is most of a turn's wall-clock — the model deciding its next call, or
 * writing the answer — and the trace had nothing to say during it: every dot was a
 * finished outcome, so a running turn rendered as a finished one. The row this returns
 * carries the "still going" motion (`ToolTrace`'s `is-current`) WITHOUT changing the
 * step's own outcome. An in-flight call already has its own spinner, so this yields
 * nothing then — two moving dots would claim two things are happening.
 */
export function isCurrentStep(
  runs: TraceRun[],
  live: boolean,
  runIndex: number,
  toolIndex: number,
): boolean {
  if (!live || runIndex !== runs.length - 1) return false;
  if (toolIndex !== (runs[runIndex]?.tools.length ?? 0) - 1) return false;
  return !runs.some((r) => r.tools.some((t) => t.state === "running"));
}

/** True when the flow ended with at least one tool in a FAILED final state (what
 *  the trace shows as "échec") — a transient failure that later RECOVERED does not
 *  count (collapsed to a succeeded row). Drives the "retry this flow" affordance.
 *  ⚠️ A user DECLINE (`declined`) is NOT a failure: offering « Réessayer »
 *  after a no amounts to re-posing the very write that was just declined. */
export function hasFailedTool(calls?: ToolCallRecord[]): boolean {
  return groupToolCalls(calls).some((run) => run.tools.some((t) => t.state === "error"));
}
