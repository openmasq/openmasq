// @vitest-environment jsdom
// The PARAMETRISED real-model suite: `scenarios.eval.ts` (whole catalog, serial) and
// the `par/shard-*.eval.ts` wrappers (parallel opt-in) both call `defineScenarioSuite`,
// so the measurement/report machinery lives ONCE.
//
// Server modes (OPENMASQ_EVAL_SERVERS):
//   declared (default) — each scenario offers ITS OWN connectors (the full contract);
//   none              — NO server at all: measures honest degradation (no call
//                       should be hallucinated, the reply must stay useful);
//   all               — the WHOLE fleet offered: measures cross-tool CONFUSION
//                       (competing CRMs, two Stripe views…), contract unchanged.
//
// Strategy axis (OPENMASQ_EVAL_STRATEGY, default "current"): which set of prompt/tool-
// catalogue reduction thresholds is applied (`evals/strategies.ts`) — orthogonal
// to the server mode, crossed by `scripts/bench-agentic.ts --strategies`.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, it } from "vitest";
import { setDynamicModels, type ProviderId } from "@openmasq/llm";
import { expectAtLeast, score } from "../score";
import { ALL_FLEET } from "../servers";
import { resolveStrategy } from "../strategies";
import { SCENARIOS } from "./catalog";
import { WORKFLOW_SCENARIOS } from "./catalog.workflows";
import { WORKFLOW2_SCENARIOS } from "./catalog.workflows2";
import { REAL_SCENARIOS } from "./catalog.real";
import { REAL_DATA_SCENARIOS } from "./catalog.realData";
import { runScenario, type Scenario } from "./index";

const KEY = process.env.OPENMASQ_EVAL_API_KEY || process.env.ZEN_API_KEY;
const PROVIDER = (process.env.OPENMASQ_EVAL_PROVIDER || "openrouter") as ProviderId;
const MODEL_ID = process.env.OPENMASQ_EVAL_MODEL || "poolside/laguna-s-2.1:free";
const RUNS = Number(process.env.OPENMASQ_EVAL_RUNS || 2);
const TIMEOUT = 420_000;
const SERVERS_MODE = (process.env.OPENMASQ_EVAL_SERVERS || "declared") as
  | "declared"
  | "none"
  | "all";
const STRATEGY_NAME = process.env.OPENMASQ_EVAL_STRATEGY || "current";
const STRATEGY = resolveStrategy(STRATEGY_NAME);

// An OpenRouter model evaluated here must reflect the LIVE APP, where the
// DYNAMIC catalogue (`useOpenRouterModels` → `setDynamicModels`) replaces the static registry
// and where live declares e.g. the Gemma tiers as tools-capable — without this declaration, the
// static `supportsTools` (noTools) would send the store down the plain-stream path and the eval
// would never exercise the agentic loop.
if (PROVIDER === "openrouter") {
  setDynamicModels("openrouter", [
    { id: MODEL_ID, label: MODEL_ID, provider: "openrouter", tools: true },
  ]);
}

const model = () => ({
  provider: PROVIDER,
  modelId: MODEL_ID,
  apiKey: KEY,
  baseUrl: process.env.OPENMASQ_EVAL_BASE_URL,
});

/** Applies the servers mode + the reduction strategy to a scenario (the contract
 *  adapts, never silently). */
function withServersMode(sc: Scenario): Scenario {
  if (SERVERS_MODE === "declared") return { ...sc, routingConfig: STRATEGY };
  if (SERVERS_MODE === "none") {
    // With NO connector at all: the contract becomes honest degradation — zero call
    // (trivially) and a non-empty reply that doesn't hallucinate an action taken.
    return {
      ...sc,
      servers: [],
      routingConfig: STRATEGY,
      spec: {
        sequence: [],
        answer: (s) =>
          s.trim().length > 0 && !/j'ai (?:envoyé|créé|calé|ajouté)|c'est (?:envoyé|fait)/i.test(s),
      },
    };
  }
  // all: the WHOLE fleet, the scenario's declared servers first (a colliding
  // id — two Stripe views — keeps the variant the contract expects).
  const seen = new Set(sc.servers.map((s) => s.id));
  const extra = ALL_FLEET.filter((s) => !seen.has(s.id));
  return { ...sc, servers: [...sc.servers, ...extra], routingConfig: STRATEGY };
}

export interface SuiteOpts {
  /** Shard [index, of] — parallelisation by FILES (each wrapper = one jsdom). */
  shard?: [number, number];
  /** Active only when this predicate is (the wrappers require EVAL_PARALLEL). */
  enabled?: boolean;
}

interface RunRow {
  scenario: string;
  run: number;
  ok: boolean;
  failures: string;
  ms: number;
  /** Wall time of the FIRST model call — the one carrying the biggest system
   *  prompt/tool catalog, so the metric a prompt-size STRATEGY actually moves.
   *  0 when the harness never recorded one (e.g. a scenario that aborted before
   *  any model call). */
  firstCallMs: number;
  modelTurns: number;
  toolCalls: string[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  answer: string;
}

/** Nearest-rank percentile over a copy of `values` (empty ⇒ 0). Pure, no interpolation —
 *  a report figure, not a statistics claim. */
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function defineScenarioSuite(opts: SuiteOpts = {}): void {
  const DUMP = process.env.OPENMASQ_EVAL_DUMP;
  if (DUMP) mkdirSync(DUMP, { recursive: true });
  let runSeq = 0;

  const ONLY = process.env.OPENMASQ_EVAL_ONLY;
  const catalog = [...SCENARIOS, ...WORKFLOW_SCENARIOS, ...WORKFLOW2_SCENARIOS, ...REAL_SCENARIOS, ...REAL_DATA_SCENARIOS]
    .filter((s) => !ONLY || s.name.startsWith(ONLY))
    .filter((_, i) => !opts.shard || i % opts.shard[1] === opts.shard[0]);

  const ROWS: RunRow[] = [];
  const STARTED = new Date();
  const shardTag = opts.shard ? ` [shard ${opts.shard[0] + 1}/${opts.shard[1]}]` : "";
  const enabled = (opts.enabled ?? true) && !!KEY && catalog.length > 0;

  describe.skipIf(!enabled)(
    `scenario catalog — real model (${MODEL_ID}, servers=${SERVERS_MODE}, strategy=${STRATEGY_NAME})${shardTag}`,
    () => {
      for (const raw of catalog) {
        const sc = withServersMode(raw);
        it(
          sc.name,
          async () => {
            let runIdx = 0;
            const s = await score(RUNS, async () => {
              const t0 = Date.now();
              let scenarioRun;
              try {
                scenarioRun = await runScenario(model(), sc);
              } catch (e) {
                // A throw (`always` assert, safety guard) must stay VISIBLE in
                // the report: without this line the run disappears ("6/7" when 9
                // actually ran) and the failure only exists in vitest's output.
                ROWS.push({
                  scenario: sc.name, run: ++runIdx, ok: false,
                  failures: `ABORT : ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
                  ms: Date.now() - t0, firstCallMs: 0, modelTurns: 0, toolCalls: [],
                  inputTokens: 0, outputTokens: 0, cachedTokens: 0, answer: "",
                });
                throw e;
              }
              const { run, verdict } = scenarioRun;
              const ms = Date.now() - t0;
              ROWS.push({
                scenario: sc.name,
                run: ++runIdx,
                ok: verdict.ok,
                failures: verdict.ok ? "" : verdict.failures.join(" · "),
                ms,
                firstCallMs: run.transcript.firstCallMs() ?? 0,
                modelTurns: run.transcript.usage.modelTurns,
                toolCalls: run.transcript.events.flatMap((e) => (e.t === "tool:out" ? [e.name] : [])),
                inputTokens: run.transcript.usage.inputTokens,
                outputTokens: run.transcript.usage.outputTokens,
                cachedTokens: run.transcript.usage.cachedTokens,
                answer: String(run.lastAssistant()?.content ?? "").slice(0, 140),
              });
              if (DUMP) {
                const first = run.transcript.events.find((e) => e.t === "model:in");
                const inbox =
                  first && first.t === "model:in"
                    ? first.messages.map((m) => `--- ${m.role} ---\n${m.content}`).join("\n")
                    : "(aucun model:in)";
                const body =
                  `# ${sc.name} — ${MODEL_ID} — servers=${SERVERS_MODE} — strategy=${STRATEGY_NAME}\n# verdict: ${verdict.ok ? "OK" : verdict.failures.join(" · ")}\n\n` +
                  run.transcript.format() +
                  `\n\n## premier model:in\n${inbox}\n`;
                // Model slug as prefix: several suites (bench) share the same DUMP.
                const mSlug = MODEL_ID.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
                writeFileSync(resolve(DUMP, `${mSlug}--${sc.name}-${SERVERS_MODE}-${STRATEGY_NAME}-${++runSeq}.txt`), body);
              }
              const dump = verdict.ok ? "" : `\n${run.transcript.format()}`;
              await run.dispose();
              return verdict.ok || `${verdict.failures.join(" · ")}${dump}`;
            });
            expectAtLeast(Math.ceil(RUNS * 0.5), s, `conformité « ${sc.name} » (servers=${SERVERS_MODE})`);
          },
          TIMEOUT,
        );
      }

      afterAll(() => {
        if (!ROWS.length) return;
        const slugDir = MODEL_ID.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
        const dir = resolve(process.cwd(), "evals-reports", slugDir);
        mkdirSync(dir, { recursive: true });
        const shardSlug = opts.shard ? `-shard${opts.shard[0]}` : "";
        const stamp = STARTED.toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const okCount = ROWS.filter((r) => r.ok).length;
        const tot = (f: (r: RunRow) => number) => ROWS.reduce((a, r) => a + f(r), 0);
        // The FIRST model call alone — the one carrying the biggest system prompt/
        // tool catalogue, so the only one comparable across reduction STRATEGIES (the
        // following turns depend on the number of tool calls, not the initial prompt).
        const firstCalls = ROWS.map((r) => r.firstCallMs).filter((ms) => ms > 0);
        const p50 = percentile(firstCalls, 50);
        const p95 = percentile(firstCalls, 95);
        const lines = [
          `# Eval workflows — ${MODEL_ID} — servers=${SERVERS_MODE} — strategy=${STRATEGY_NAME}${shardTag}`,
          "",
          `- **Date** : ${STARTED.toISOString()}`,
          `- **Provider** : ${PROVIDER} · **Runs/scénario** : ${RUNS}${ONLY ? ` · **Filtre** : ${ONLY}` : ""} · **Serveurs** : ${SERVERS_MODE} · **Stratégie** : ${STRATEGY_NAME}`,
          `- **Conformité** : ${okCount}/${ROWS.length} runs`,
          `- **Totaux** : ${tot((r) => r.toolCalls.length)} tool-calls · ${tot((r) => r.modelTurns)} tours modèle · ${tot((r) => r.inputTokens)} tokens ↑ (dont ${tot((r) => r.cachedTokens)} cachés) · ${tot((r) => r.outputTokens)} tokens ↓ · ${(tot((r) => r.ms) / 1000).toFixed(1)} s cumulées · 1er appel p50=${p50}ms p95=${p95}ms`,
          "",
          "| Scénario | Run | Verdict | Durée | 1er appel | Tours | Tool-calls | Tokens ↑ | Cachés | Tokens ↓ |",
          "|---|---|---|---|---|---|---|---|---|---|",
          ...ROWS.map(
            (r) =>
              `| ${r.scenario} | ${r.run} | ${r.ok ? "✅" : "❌"} | ${(r.ms / 1000).toFixed(1)} s | ${r.firstCallMs} ms | ${r.modelTurns} | ${r.toolCalls.length}${r.toolCalls.length ? ` (${r.toolCalls.join(", ")})` : ""} | ${r.inputTokens} | ${r.cachedTokens} | ${r.outputTokens} |`,
          ),
          "",
          "## Détails par run",
          "",
          ...ROWS.flatMap((r) => [
            `### ${r.scenario} — run ${r.run} ${r.ok ? "✅" : "❌"}`,
            r.failures ? `- Échecs : ${r.failures}` : "",
            `- Réponse : ${r.answer ? `« ${r.answer}${r.answer.length >= 140 ? "…" : ""} »` : "(vide)"}`,
            "",
          ]).filter((l) => l !== ""),
        ];
        const file = resolve(dir, `${stamp}-${SERVERS_MODE}-${STRATEGY_NAME}${shardSlug}.md`);
        writeFileSync(file, lines.join("\n"));
        console.log(`\n📊 rapport : ${file}`);
      });
    },
  );
}
