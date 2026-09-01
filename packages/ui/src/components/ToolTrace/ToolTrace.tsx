import type { CSSProperties } from "react";
import { CheckIcon, BrowserIcon } from "../brand";
import { MCP_LOGOS, MCP_LOGO_IMAGES } from "../media/McpTile";
import { formatElapsed } from "../../agent/mcpAgentWatchdog";
import { groupToolCalls, isCurrentStep, type ToolCallRecord, type TraceTool } from "./trace";
import { humanToolLabel } from "../../agent/humanToolLabel";

import { useT } from "../../i18n";
/** The status dot at the head of each tool row: done (lime check), error (amber),
 *  running (spinner) or pending (hollow ring) — matches the design-system trace.
 *
 *  `current` is the BETWEEN-TOOLS state, and it is why the dot is not just its
 *  outcome: while the turn is live but no call is in flight (the model is deciding
 *  the next step, or writing the answer), nothing spun and a finished list read as a
 *  finished turn. The last step keeps its real outcome and gains a thin rotating ring
 *  — alive, without the dot claiming the step is still running. */
function StepDot({ state, current }: { state: TraceTool["state"]; current?: boolean }) {
  const ring = current ? " is-current" : "";
  if (state === "done")
    return (
      <span className={`mcp-trace-dot done${ring}`}>
        <CheckIcon size={12} />
      </span>
    );
  if (state === "error") return <span className={`mcp-trace-dot error${ring}`}>!</span>;
  // A USER refusal isn't a failure: no red « ! » — the guardrail did
  // its job. The neutral dot is enough, the row says « refusé ».
  if (state === "declined") return <span className={`mcp-trace-dot pending${ring}`}>–</span>;
  if (state === "running") return <span className="mcp-trace-dot om-spin" />;
  return <span className="mcp-trace-dot pending" />;
}

/**
 * The agentic MCP tool-call trace, rendered as one card per connector: a glyph
 * tile + connector name + "N outils · terminé" status, then the ordered list of
 * tool calls each with its result blurb. Reproduces the design-system
 * `WorkflowTrace`. Reads the PERSISTED `Message.toolCalls`, so it survives a
 * reload; `pendingTool` (the call currently in flight) adds the live "running"
 * row while the turn streams.
 */
export function ToolTrace({
  calls,
  pendingTool,
  pendingStatus,
  live = false,
}: {
  calls?: ToolCallRecord[];
  pendingTool?: string | null;
  /** Live status for the in-flight tool (e.g. the Python runner's phase / stdout) —
   *  shown in place of the static "en cours…" so the indicator evolves. */
  pendingStatus?: string;
  live?: boolean;
}) {
  const t = useT();
  const runs = groupToolCalls(calls, pendingTool);
  if (runs.length === 0) return null;

  return (
    <>
      {live && <div className="cv-eyebrow om-think-label mcp-trace-eyebrow">          {t.leaves.toolTrace}
</div>}
      {runs.map((run, runIndex) => {
        // A live turn is BUSY even between two calls — « terminé » under a still-running
        // turn is the same untruth the frozen dots were.
        const busy = live || run.tools.some((t) => t.state === "running");
        const done = run.tools.filter((t) => t.state !== "running").length;
        // The connector's REAL brand logo, when the catalog carries one. Rendered
        // always but hidden by CSS except in the blue / blue-dark themes, where the
        // glyph becomes a monochrome logo on a neutral tile with a grey border.
        const logo = run.connectorId ? MCP_LOGOS[run.connectorId] : undefined;
        const img = run.connectorId ? MCP_LOGO_IMAGES[run.connectorId] : undefined;
        const hasLogo = run.serverId !== "browser" && run.serverId !== "web" && !!(logo || img);
        return (
          <div key={run.serverId} className="mcp-trace">
            <div className="mcp-trace-head">
              <span
                className={`mcp-trace-glyph ${busy ? "om-mcp-ring" : ""}${hasLogo ? " has-logo" : ""}`}
                style={{ "--glyph-hue": `var(--hl-${run.tone})` } as CSSProperties}
              >
                {/* The two web-reading builtins get a real icon — "NA"/"LE" letters read
                    as an error, not a brand. */}
                {run.serverId === "browser" || run.serverId === "web" ? (
                  <BrowserIcon size={16} />
                ) : (
                  <>
                    <span className="mcp-trace-glyph-letters">{run.glyph}</span>
                    {logo ? (
                      <svg className="mcp-trace-glyph-logo" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d={logo.path} />
                      </svg>
                    ) : img ? (
                      <img className="mcp-trace-glyph-logo" src={img} alt="" aria-hidden="true" />
                    ) : null}
                  </>
                )}
              </span>
              <div className="mcp-trace-head-text">
                <div className="mcp-trace-title">
                  {run.name}
                  {/* Built-in intercepted tools (the code interpreter) are NOT MCP
                      connectors — no "MCP" badge, so it never reads "PythonMCP". */}
                  {!run.builtin && <span className="mcp-trace-mcp">connecteur</span>}
                </div>
                <div className="mcp-trace-status">
                  {busy
                    ? done > 0
                      ? `${done} action${done > 1 ? "s" : ""} · en cours…`
                      : "Appel des outils…"
                    : `${done} action${done > 1 ? "s" : ""} · terminé`}
                </div>
              </div>
            </div>
            <div className="mcp-trace-list">
              {run.tools.map((t, i) => {
                // Collapsed retry loop → one discreet hint instead of a wall of
                // "échec" rows. On a recovered call: "N tentatives"; on a fully
                // failed one: "échec · N tentatives".
                const retries =
                  (t.attempts ?? 1) > 1 && (t.failures ?? 0) > 0
                    ? t.state === "running"
                      ? `nouvel essai (${t.attempts}\u1d49)`
                      : `${t.attempts} tentatives`
                    : null;
                // Duration chip on finished rows, only when NOTABLE (≥2 s): where the
                // turn's time went, without stamping "0 s" on every instant call.
                const took = t.state !== "running" && (t.ms ?? 0) >= 2000 ? formatElapsed(t.ms!) : null;
                return (
                  <div key={`${t.name}-${i}`} className="mcp-trace-row om-step-in">
                    <StepDot state={t.state} current={isCurrentStep(runs, live, runIndex, i)} />
                    <span className="mcp-trace-name" title={t.name}>{humanToolLabel(run.serverId, t.name)}</span>
                    {retries && <span className="mcp-trace-retries">{retries}</span>}
                    {took && <span className="mcp-trace-retries">{took}</span>}
                    <span className="mcp-trace-spacer" />
                    {t.state === "running" ? (
                      <span className="mcp-trace-running">{pendingStatus || "en cours…"}</span>
                    ) : t.state === "error" ? (
                      // ⚠️ A failure STATES its cause when it has one. Without the note, an app
                      // refusal (intent gate, domain not allowed) displayed as a bare « échec »
                      // — and the model paraphrased it by blaming the service
                      // (« refusée par l'intégration », measured 15/08). The trace, though, is
                      // not rewritable by the model: it's the only place that can say
                      // WHO refused.
                      <span className="mcp-trace-summary err">{t.note ? `échec — ${t.note}` : "échec"}</span>
                    ) : t.state === "declined" ? (
                      // The word for the refusal, without the error tint: saying no worked.
                      <span className="mcp-trace-summary">refusé</span>
                    ) : (
                      // The human narration ("Recherche d'actualités…") reads better than
                      // the raw result blurb ("10 résultats"); fall back to summary.
                      (t.note || t.summary) && (
                        <span className="mcp-trace-summary">{t.note || t.summary}</span>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
