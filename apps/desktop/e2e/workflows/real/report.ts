import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DESKTOP_DIR } from "../env";
import type { LabResult } from "./lab";

/*
 * WRITING EVAL REPORTS — `evals-reports/`, at the repo root.
 *
 * Two benches, two folders, NEVER mixed: their numbers don't mean
 * the same thing. The FIXTURES bench is deterministic (canned tool results) —
 * it measures the MODEL and the GUIDANCE, and it's repeatable at will. The E2E bench
 * touches real servers — it measures what the user will experience, but its
 * numbers move with service latency and the accounts' real content.
 * Comparing a fixtures run to an e2e run would prove nothing; comparing two
 * fixtures runs before/after a guidance change does.
 *
 * ⚠️ A report NEVER contains the answers' plaintext: the benches
 * touch real accounts (fixtures included — their results carry test
 * PII). We write MEASUREMENTS (durations, call counts, repetitions,
 * verdicts) and, at most, a short excerpt explicitly neutralized.
 */

export type EvalMode = "fixtures" | "e2e";

export interface EvalRun {
  mode: EvalMode;
  model: string;
  group: string;
  family: string;
  connectors: string[];
  results: LabResult[];
  /** Write confirmations requested by the loop (tool + verdict). */
  confirms: { tool: string; approved: boolean }[];
  /** Timestamp provided by the caller (the spec) — no hidden clock here. */
  at: string;
}

const REPORT_DIR = resolve(DESKTOP_DIR, "../../evals-reports");

const dirFor = (mode: EvalMode) => resolve(REPORT_DIR, mode);

/** A run's aggregated metrics — what we track from one run to the next. */
export function metricsOf(results: LabResult[]) {
  const n = results.length || 1;
  const calls = results.reduce((s, r) => s + r.tools.length, 0);
  return {
    prompts: results.length,
    ok: results.filter((r) => !r.error && !r.timedOut && !r.loopStopped).length,
    errors: results.filter((r) => r.error).length,
    stuck: results.filter((r) => r.timedOut).length,
    looped: results.filter((r) => r.loopStopped).length,
    /** Loops where a TOOL NAME was redacted: the loop is (at least in part)
     *  induced by the NER, not by the model — to subtract from the model's blame. */
    redactLoops: results.filter((r) => r.loopStopped && r.toolRedactions.length).length,
    /** Turns WITHOUT a single tool call: the model denied a capability it had. */
    silent: results.filter((r) => !r.tools.length && !r.error).length,
    calls,
    /** Worst repeat of the same tool, across all turns. */
    worstRepeat: Math.max(0, ...results.map((r) => r.maxRepeat)),
    /** DISTINCT tools touched — the "breadth" on a complex workflow. */
    distinctTools: new Set(results.flatMap((r) => r.tools)).size,
    medianMs: [...results.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(n / 2)] ?? 0,
    maxMs: Math.max(0, ...results.map((r) => r.ms)),
  };
}

const stateOf = (r: LabResult) =>
  r.timedOut ? "⏳ bloqué" : r.error ? "✗ erreur" : r.loopStopped ? "🔁 boucle" : r.tools.length ? "✓" : "⚠️ sans outil";

/** Writes (or appends to) a run's report and returns its path. */
export function writeEvalReport(run: EvalRun): string {
  const dir = dirFor(run.mode);
  mkdirSync(dir, { recursive: true });
  const slug = run.model.replace(/[^\w.-]+/g, "-");
  const path = resolve(dir, `${slug}.md`);
  const m = metricsOf(run.results);

  if (!existsSync(path)) {
    writeFileSync(
      path,
      `# ${run.model} — banc ${run.mode}\n\n` +
        `Un bloc par exécution de groupe, le plus récent EN BAS. ` +
        `Ce qu'on regarde bouger : \`sans outil\` et \`boucle\` (fiabilité), ` +
        `\`médiane\` (vitesse), \`outils distincts\` (largeur sur un workflow complexe).\n`,
    );
  }

  const rows = run.results
    .map(
      (r) =>
        `| ${r.id} | ${stateOf(r)} | ${Math.round(r.ms / 1000)} s | ${r.tools.length} | ${r.maxRepeat}× | ` +
        `${[...new Set(r.tools)].join(", ") || "—"} |`,
    )
    .join("\n");

  const writes = run.confirms.length
    ? run.confirms.map((c) => `${c.tool}${c.approved ? "" : " (refusé)"}`).join(", ")
    : "aucune";

  appendFileSync(
    path,
    `\n## ${run.at} · groupe \`${run.group}\` (${run.family}) · connecteurs : ${run.connectors.join(", ") || "aucun"}\n\n` +
      `${m.ok}/${m.prompts} nets · ${m.errors} erreur(s) · ${m.stuck} bloqué(s) · ${m.looped} boucle(s)` +
      `${m.redactLoops ? ` (dont ${m.redactLoops} par REDACTION d'un nom d'outil)` : ""} · ` +
      `${m.silent} sans outil · ${m.calls} appels (${m.distinctTools} outils distincts) · ` +
      `pire répétition ${m.worstRepeat}× · médiane ${Math.round(m.medianMs / 1000)} s · max ${Math.round(m.maxMs / 1000)} s\n\n` +
      `| workflow | état | durée | appels | répét. max | outils |\n|---|---|---|---|---|---|\n${rows}\n\n` +
      `Écritures confirmées : ${writes}\n`,
  );
  return path;
}

/** One line per run in a shared index — the "all models" view at a glance. */
export function appendEvalIndex(run: EvalRun): void {
  const dir = dirFor(run.mode);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "index.md");
  if (!existsSync(path))
    writeFileSync(
      path,
      `# Banc ${run.mode} — index\n\n` +
        `| date | modèle | groupe | nets | erreurs | boucles | sans outil | répét. max | médiane |\n` +
        `|---|---|---|---|---|---|---|---|---|\n`,
    );
  const m = metricsOf(run.results);
  appendFileSync(
    path,
    `| ${run.at} | ${run.model} | ${run.group} | ${m.ok}/${m.prompts} | ${m.errors} | ${m.looped} | ` +
      `${m.silent} | ${m.worstRepeat}× | ${Math.round(m.medianMs / 1000)} s |\n`,
  );
}
