/**
 * L'orchestrateur de bench agentique — `pnpm bench` : relance toute la matrice
 * modèles × modes en UNE commande, agrège un rapport comparatif CROSS-MODÈLES et
 * DIFFE contre le bench précédent (les régressions de conformité/latence/tokens
 * deviennent visibles automatiquement).
 *
 *   pnpm bench                                   # matrice par défaut (3 modèles, declared)
 *   pnpm bench --models a,b --modes declared,all # matrice explicite
 *   pnpm bench --real --runs 2 --only wf         # + scénarios monde réel
 *   pnpm bench --strategies current,lean         # + axe stratégie de réduction du prompt
 *                                                 # (`packages/ui/src/evals/strategies.ts`)
 *
 * Pools : les modèles PAYANTS courent en PARALLÈLE (intra-suite shardée ×4) ; les
 * `:free` en SÉRIE avec intra ×2 (limite de compte OpenRouter par modèles gratuits).
 * Chaque suite écrit son rapport par modèle comme d'habitude ; l'orchestrateur
 * collecte les chemins émis (« 📊 rapport : … »), agrège `evals-reports/_bench/
 * <stamp>.md` (+ `.json` pour le diff machine) et compare au dernier `.json`.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Cell { model: string; mode: string; real: boolean; strategy: string }
interface Metrics { ok: number; runs: number; calls: number; turns: number; up: number; cached: number; down: number; secs: number; p50: number; p95: number }

const ARGV = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = ARGV.indexOf(`--${name}`);
  return i >= 0 ? ARGV[i + 1] : undefined;
};
// laguna-xs-2.1 : 9/9 réel · 120 s · 55 % de cache au bench du 2026-07-24 — la référence.
const DEFAULT_MODELS = "poolside/laguna-xs-2.1,inclusionai/ling-2.6-flash,nex-agi/nex-n2-mini";
const MODELS = (flag("models") ?? DEFAULT_MODELS).split(",").map((s) => s.trim()).filter(Boolean);
const MODES = (flag("modes") ?? "declared").split(",").map((s) => s.trim()).filter(Boolean);
const STRATEGIES = (flag("strategies") ?? "current").split(",").map((s) => s.trim()).filter(Boolean);
const RUNS = flag("runs") ?? "2";
const ONLY = flag("only") ?? "wf";
const REAL = ARGV.includes("--real");
const ROOT = resolve(__dirname, "..");

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const env = readFileSync(resolve(ROOT, "apps/desktop/.env"), "utf8");
    const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(env);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
  } catch { /* absent → la suite se skip et on le dira */ }
  return "";
}

/** Lance UNE suite (un modèle × un mode) et renvoie les chemins de rapports émis. */
function runSuite(cell: Cell, key: string): Promise<{ cell: Cell; reports: string[]; code: number }> {
  const free = cell.model.endsWith(":free");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENMASQ_EVAL_PROVIDER: "openrouter",
    OPENMASQ_EVAL_MODEL: cell.model,
    OPENMASQ_EVAL_API_KEY: key,
    OPENMASQ_EVAL_RUNS: RUNS,
    OPENMASQ_EVAL_ONLY: cell.real ? "real-" : ONLY,
    OPENMASQ_EVAL_SERVERS: cell.mode,
    OPENMASQ_EVAL_STRATEGY: cell.strategy,
    ...(cell.real ? { OPENMASQ_EVAL_REAL_WEB: "1", OPENMASQ_EVAL_REAL_PY: "1" } : { OPENMASQ_EVAL_PARALLEL: free ? "2" : "4" }),
  };
  // real- : suite SÉRIELLE (un seul jsdom suffit, 5 scénarios) ; sinon les shards.
  const target = cell.real
    ? "packages/ui/src/evals/scenarios/scenarios.eval.ts"
    : "packages/ui/src/evals/scenarios/par";
  return new Promise((done) => {
    const p = spawn("npx", ["vitest", "run", "--config", "vitest.evals.config.ts", target], { cwd: ROOT, env });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => {
      const reports = [...out.matchAll(/📊 rapport : (.+\.md)/g)].map((m) => m[1].trim());
      const label = `${cell.model}${cell.real ? " [réel]" : ` [${cell.mode}]`} · stratégie=${cell.strategy}`;
      // Log brut par cellule — le matériau de debug d'un bench qui tourne mal.
      const logDir = resolve(ROOT, "evals-reports/_bench/logs");
      mkdirSync(logDir, { recursive: true });
      const slug = `${cell.model.replace(/[^a-z0-9]+/gi, "-")}-${cell.real ? "reel" : cell.mode}-${cell.strategy}`;
      writeFileSync(resolve(logDir, `${slug}.log`), out);
      console.log(`  ${code === 0 ? "✅" : "❌"} ${label} — ${reports.length} rapport(s)`);
      done({ cell, reports, code: code ?? 1 });
    });
  });
}

/** Agrège les métriques des rapports d'une cellule (somme des shards). p50/p95 du
 *  1er appel ne se SOMMENT pas — chaque shard n'a sa propre distribution que sur SA
 *  part du catalogue, donc on garde le PIRE shard (max) : conservateur, jamais
 *  optimiste sur la latence remontée. */
function aggregate(paths: string[]): Metrics {
  const t: Metrics = { ok: 0, runs: 0, calls: 0, turns: 0, up: 0, cached: 0, down: 0, secs: 0, p50: 0, p95: 0 };
  for (const p of paths) {
    const txt = readFileSync(p, "utf8");
    const c = /Conformité\*\* : (\d+)\/(\d+)/.exec(txt);
    const m = /Totaux\*\* : (\d+) tool-calls · (\d+) tours modèle · (\d+) tokens ↑ \(dont (\d+) cachés\) · (\d+) tokens ↓ · ([\d.]+) s cumulées · 1er appel p50=(\d+)ms p95=(\d+)ms/.exec(txt);
    if (!c || !m) continue;
    t.ok += +c[1]; t.runs += +c[2]; t.calls += +m[1]; t.turns += +m[2];
    t.up += +m[3]; t.cached += +m[4]; t.down += +m[5]; t.secs += +m[6];
    t.p50 = Math.max(t.p50, +m[7]); t.p95 = Math.max(t.p95, +m[8]);
  }
  return t;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "—");
const delta = (now: number, prev: number | undefined, unit = "", invert = false): string => {
  if (prev === undefined || prev === 0) return "";
  const d = Math.round((now - prev) * 10) / 10;
  if (Math.abs(d) < 0.05) return " (=)";
  const worse = invert ? d > 0 : d < 0;
  return ` (${d > 0 ? "+" : ""}${d}${unit} ${worse ? "🔴" : "🟢"})`;
};

/** `--discover` : classe les modèles à OUTILS peu chers par DÉBIT MESURÉ (stats
 *  OpenRouter authentifiées : percentiles tokens/s + latence des 30 dernières minutes,
 *  par fournisseur). Sert à choisir les candidats du bench sans les payer d'abord. */
async function discover(key: string): Promise<void> {
  const auth = { headers: { Authorization: `Bearer ${key}` } };
  const cat = (await (await fetch("https://openrouter.ai/api/v1/models", auth)).json()) as {
    data: { id: string; pricing: { prompt: string; completion: string }; supported_parameters?: string[]; architecture?: { output_modalities?: string[] } }[];
  };
  const cheap = cat.data.filter((m) => {
    const outs = m.architecture?.output_modalities ?? ["text"];
    return (
      (m.supported_parameters ?? []).includes("tools") &&
      outs.every((o) => o === "text") &&
      Number(m.pricing.prompt) * 1e6 <= 0.3 &&
      Number(m.pricing.completion) * 1e6 <= 1.2
    );
  });
  console.log(`${cheap.length} modèles à outils ≤0,30 $/M — stats sur les ${Math.min(cheap.length, 40)} moins chers…`);
  cheap.sort((a, b) => Number(a.pricing.prompt) - Number(b.pricing.prompt));
  const rows: { tp: number; lat: number; id: string; prov: string; price: string }[] = [];
  await Promise.all(
    cheap.slice(0, 40).map(async (m) => {
      try {
        const d = (await (await fetch(`https://openrouter.ai/api/v1/models/${m.id}/endpoints`, auth)).json()) as {
          data: { endpoints: { provider_name: string; uptime_last_1d?: number; throughput_last_30m?: { p50?: number }; latency_last_30m?: { p50?: number } }[] };
        };
        let best: { tp: number; lat: number; prov: string } | undefined;
        for (const e of d.data.endpoints) {
          const tp = e.throughput_last_30m?.p50 ?? 0;
          if (tp && (e.uptime_last_1d ?? 0) > 95 && (!best || tp > best.tp)) {
            best = { tp, lat: e.latency_last_30m?.p50 ?? 0, prov: e.provider_name };
          }
        }
        if (best) {
          rows.push({ ...best, id: m.id, price: `${(Number(m.pricing.prompt) * 1e6).toFixed(2)}/${(Number(m.pricing.completion) * 1e6).toFixed(2)}` });
        }
      } catch {
        /* un modèle sans stats est simplement absent du classement */
      }
    }),
  );
  rows.sort((a, b) => b.tp - a.tp);
  console.log("tok/s p50 | lat p50 | prix $/M | modèle → meilleur fournisseur");
  for (const r of rows) console.log(`${String(r.tp).padStart(8)} | ${(r.lat / 1000).toFixed(2)} s | ${r.price.padStart(9)} | ${r.id} → ${r.prov}`);
}

async function main(): Promise<void> {
  const key = apiKey();
  if (ARGV.includes("--discover")) {
    if (!key) throw new Error("OPENROUTER_API_KEY requis (les stats de débit sont authentifiées)");
    return discover(key);
  }
  if (!key) console.warn("⚠️  OPENROUTER_API_KEY introuvable (env ou apps/desktop/.env) — les suites vont se skip.");
  const cells: Cell[] = MODELS.flatMap((model) =>
    STRATEGIES.flatMap((strategy) => [
      ...MODES.map((mode) => ({ model, mode, real: false, strategy })),
      ...(REAL ? [{ model, mode: "declared", real: true, strategy }] : []),
    ]),
  );
  const paid = cells.filter((c) => !c.model.endsWith(":free"));
  const free = cells.filter((c) => c.model.endsWith(":free"));
  console.log(
    `Bench : ${MODELS.length} modèle(s) × [${MODES.join(", ")}${REAL ? " + réel" : ""}] × stratégies=[${STRATEGIES.join(", ")}] · runs=${RUNS} · only=${ONLY}`,
  );

  const results: { cell: Cell; reports: string[]; code: number }[] = [];
  // Payants : tous en parallèle. Frees : en série (limite du pool :free du compte).
  results.push(...(await Promise.all(paid.map((c) => runSuite(c, key)))));
  for (const c of free) results.push(await runSuite(c, key));

  // ── Agrégation + diff vs le bench précédent ────────────────────────────────
  const benchDir = resolve(ROOT, "evals-reports/_bench");
  mkdirSync(benchDir, { recursive: true });
  const prevFile = readdirSync(benchDir).filter((f) => f.endsWith(".json")).sort().pop();
  const prev: Record<string, Metrics> = prevFile ? JSON.parse(readFileSync(resolve(benchDir, prevFile), "utf8")) : {};

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const snapshot: Record<string, Metrics> = {};
  const rows: string[] = [];
  for (const r of results) {
    const kind = r.cell.real ? "réel" : r.cell.mode;
    const cellKey = `${r.cell.model}|${kind}|${r.cell.strategy}`;
    const m = aggregate(r.reports);
    snapshot[cellKey] = m;
    const p = prev[cellKey];
    rows.push(
      `| ${r.cell.model} | ${kind} | ${r.cell.strategy} | ${m.ok}/${m.runs}${delta(m.ok, p?.ok)} | ${m.secs.toFixed(0)} s${delta(m.secs, p?.secs, " s", true)} | ` +
        `${m.p50} ms${delta(m.p50, p?.p50, " ms", true)} | ${m.p95} ms${delta(m.p95, p?.p95, " ms", true)} | ` +
        `${m.turns}${delta(m.turns, p?.turns, "", true)} | ${m.calls} | ${(m.up / 1000).toFixed(0)}k${delta(m.up / 1000, p ? p.up / 1000 : undefined, "k", true)} | ` +
        `${pct(m.cached, m.up)} | ${(m.down / 1000).toFixed(1)}k |`,
    );
  }
  const md = [
    `# Bench agentique — ${stamp}`,
    "",
    `- Modèles : ${MODELS.join(", ")} · Modes : ${MODES.join(", ")}${REAL ? " + réel" : ""} · Stratégies : ${STRATEGIES.join(", ")} · Runs/scénario : ${RUNS} · Filtre : ${ONLY}`,
    prevFile ? `- Diff vs : \`${prevFile}\` — 🔴 régression · 🟢 amélioration` : "- Premier bench (aucun précédent à comparer)",
    "",
    "| Modèle | Mode | Stratégie | Conformité | Durée | 1er appel p50 | 1er appel p95 | Tours | Calls | Tokens ↑ | Cachés | Tokens ↓ |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `Rapports détaillés par modèle : \`evals-reports/<modèle>/\`.`,
  ].join("\n");
  writeFileSync(resolve(benchDir, `${stamp}.md`), md);
  writeFileSync(resolve(benchDir, `${stamp}.json`), JSON.stringify(snapshot, null, 2));
  console.log(`\n${md}\n\n📊 bench : evals-reports/_bench/${stamp}.md`);
  if (results.some((r) => r.code !== 0)) process.exitCode = 1;
}

void main();
