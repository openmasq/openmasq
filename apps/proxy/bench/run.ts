// `pnpm bench:proxy` — the utility side of the measure.
//
// The detection benches (`packages/redact/bench`) score what the engine CATCHES. This one
// scores what the answer still gets RIGHT once it is caught: the same coding-agent question,
// asked through each proxy configuration and once without any proxy at all. The gap between a
// configuration and the baseline IS the cost of the protection.
//
//   pnpm bench:proxy                        # every case, every configuration
//   pnpm bench:proxy --cases 3              # the first three cases (a cheap smoke run)
//   pnpm bench:proxy --configs clear,coding # a subset
//   pnpm bench:proxy --model sonnet         # the model `claude -p` is asked to use
//
// It calls the REAL `claude -p` on the user's own subscription, so every case costs. Nothing
// here reads an API key.
import { type BenchCase, CASES, type BenchConfig, CONFIGS } from "./cases.js";
import { askAgent, startProxy } from "./harness.js";
import { type CaseResult, type ConfigResult, writeReport } from "./report.js";

const ARGV = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = ARGV.indexOf(`--${name}`);
  return i >= 0 ? ARGV[i + 1] : undefined;
};
const PORT = Number(flag("port") ?? 8899);
const MODEL = flag("model") ?? "opus";
const cases: BenchCase[] = CASES.slice(0, Number(flag("cases") ?? CASES.length));
const wanted = flag("configs")?.split(",");
const configs: BenchConfig[] = CONFIGS.filter((c) => !wanted || wanted.includes(c.id));

async function runConfig(config: BenchConfig): Promise<ConfigResult> {
  const proxy = config.flags ? await startProxy(PORT, config.flags) : undefined;
  const baseUrl = proxy ? `http://127.0.0.1:${PORT}` : "";
  const results: CaseResult[] = [];
  try {
    for (const c of cases) {
      const before = proxy?.requests.length ?? 0;
      const answer = await askAgent(c.prompt, baseUrl, MODEL);
      const masked = (proxy?.requests.slice(before) ?? []).reduce((a, r) => a + r.masked, 0);
      const ok = !answer.failed && c.expect(answer.text.toLowerCase());
      results.push({
        caseId: c.id,
        ok,
        answer: answer.text,
        ms: answer.ms,
        masked,
        ...(answer.failed ? { failed: answer.failed } : {}),
      });
      process.stdout.write(
        `  ${ok ? "✅" : answer.failed ? "⚠️ " : "❌"} ${c.id}${answer.failed ? ` (${answer.failed.slice(0, 40)})` : ""}\n`,
      );
    }
  } finally {
    proxy?.stop();
  }
  return { config, results };
}

async function main(): Promise<void> {
  console.log(
    `Proxy utility bench · model ${MODEL} · ${cases.length} cases × ${configs.length} configurations`,
  );
  console.log("Every case is a real `claude -p` call on your subscription.\n");
  const runs: ConfigResult[] = [];
  for (const config of configs) {
    console.log(`${config.id} — ${config.label}`);
    runs.push(await runConfig(config));
    console.log("");
  }
  const { md, diff } = writeReport(runs, cases, MODEL);
  for (const r of runs) {
    const n = r.results.filter((c) => c.ok).length;
    console.log(`${r.config.id.padEnd(10)} ${n}/${r.results.length}`);
  }
  console.log(`\n📊 ${md}\n${diff}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
