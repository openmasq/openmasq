// The run's output: a markdown table a human reads, and a JSON the next run diffs against.
// Reports land under `evals-reports/` (gitignored) like the agentic bench's.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchCase, BenchConfig } from "./cases.js";

export interface CaseResult {
  caseId: string;
  ok: boolean;
  answer: string;
  ms: number;
  masked: number;
  failed?: string;
}

export interface ConfigResult {
  config: BenchConfig;
  results: CaseResult[];
}

export const OUT_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "evals-reports",
  "_proxy-utility",
);

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const score = (r: ConfigResult) => r.results.filter((c) => c.ok).length;

export function renderMarkdown(runs: ConfigResult[], cases: BenchCase[], model: string): string {
  const base = runs.find((r) => r.config.id === "clear");
  const baseScore = base ? score(base) : 0;
  const lines: string[] = [
    `# Proxy utility bench — ${model}`,
    "",
    "Does a coding-agent answer survive the masking? The same question is asked with and",
    "without the proxy; the gap is what the protection costs.",
    "",
    `Run ${new Date().toISOString()} · ${cases.length} cases · ${runs.length} configurations.`,
    "",
    "| configuration | passed | vs baseline | masked spans (avg) | median latency |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const r of runs) {
    const n = score(r);
    const delta =
      r.config.id === "clear" ? "—" : `${n - baseScore >= 0 ? "+" : ""}${n - baseScore}`;
    const masked = r.results.reduce((a, c) => a + c.masked, 0) / (r.results.length || 1);
    const ms =
      [...r.results.map((c) => c.ms)].sort((a, b) => a - b)[Math.floor(r.results.length / 2)] ?? 0;
    lines.push(
      `| \`${r.config.id}\` — ${r.config.label} | ${n}/${r.results.length} (${pct(n, r.results.length)} %) | ${delta} | ${masked.toFixed(0)} | ${(ms / 1000).toFixed(1)} s |`,
    );
  }
  lines.push(
    "",
    "## Per case",
    "",
    `| case | probes | ${runs.map((r) => `\`${r.config.id}\``).join(" | ")} |`,
  );
  lines.push(`|---|---|${runs.map(() => "---").join("|")}|`);
  for (const c of cases) {
    const cells = runs.map((r) => {
      const got = r.results.find((x) => x.caseId === c.id);
      return got ? (got.ok ? "✅" : got.failed ? `⚠️ ${got.failed.slice(0, 20)}` : "❌") : "·";
    });
    lines.push(`| \`${c.id}\` | ${c.probes} | ${cells.join(" | ")} |`);
  }
  const broken = runs.flatMap((r) =>
    r.results.filter((x) => !x.ok && !x.failed).map((x) => ({ config: r.config.id, x })),
  );
  if (broken.length) {
    lines.push("", "## What the masking broke", "");
    for (const { config, x } of broken) {
      const c = cases.find((k) => k.id === x.caseId);
      lines.push(
        `- \`${config}\` · \`${x.caseId}\` (${c?.probes}) — expected ${c?.want}; answered: ${JSON.stringify(x.answer.slice(0, 160))}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function writeReport(
  runs: ConfigResult[],
  cases: BenchCase[],
  model: string,
): { md: string; diff: string } {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const summary = Object.fromEntries(runs.map((r) => [r.config.id, score(r)]));
  const previous = latestJson();
  writeFileSync(join(OUT_DIR, `${stamp}.md`), renderMarkdown(runs, cases, model));
  writeFileSync(
    join(OUT_DIR, `${stamp}.json`),
    `${JSON.stringify({ at: stamp, model, cases: cases.length, summary, runs }, null, 2)}\n`,
  );
  return { md: join(OUT_DIR, `${stamp}.md`), diff: diffAgainst(previous, summary) };
}

function latestJson(): Record<string, number> | undefined {
  try {
    const files = readdirSync(OUT_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const last = files.at(-1);
    if (!last) return undefined;
    return (
      JSON.parse(readFileSync(join(OUT_DIR, last), "utf8")) as { summary: Record<string, number> }
    ).summary;
  } catch {
    return undefined;
  }
}

function diffAgainst(
  previous: Record<string, number> | undefined,
  now: Record<string, number>,
): string {
  if (!previous) return "no previous run to compare against";
  const moved = Object.entries(now)
    .filter(([k, v]) => previous[k] !== undefined && previous[k] !== v)
    .map(([k, v]) => `${k} ${previous[k]} → ${v}`);
  return moved.length ? `since the last run: ${moved.join(", ")}` : "no change since the last run";
}
