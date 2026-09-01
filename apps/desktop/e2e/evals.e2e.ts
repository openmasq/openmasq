/* THE AGENTIC EVALUATION BENCH — a MODELS × GROUPS matrix, two separate benches.
 *
 *   FIXTURES bench (`E2E_EVAL_MODE=fixtures`, the default) — FROZEN tool results
 *     (`e2e/fixtures/mcp/workflows.json`). The model is real, the services are not:
 *     deterministic, repeatable, no side effects. This is the bench one ITERATES on
 *     for guidance, because a before/after gap there is attributable to the change.
 *   E2E bench (`E2E_EVAL_MODE=e2e`) — the REAL connectors of the dev account. Measures
 *     what the user will live through, at the price of real writes and of a variance
 *     (service latency, real account content) that forbids reading any fine progress
 *     in it. Here we CONFIRM what the fixtures bench showed.
 *
 * The reports go to `evals-reports/<mode>/<model>.md` + an `index.md`.
 *
 * Usage:
 *   E2E_REAL=1 pnpm e2e:evals                              # fixtures, tous modèles, tous groupes
 *   E2E_REAL=1 E2E_EVAL_FAMILY=complexe pnpm e2e:evals     # only the multi-tool chains
 *   E2E_REAL=1 E2E_EVAL_MODE=e2e E2E_EVAL_ONLY=incident pnpm e2e:evals
 *   E2E_MODELS=poolside/laguna-xs-2.1,openai/gpt-oss-120b  # the matrix
 *
 * ⚠️ The e2e bench = REAL writes on the dev workspace (marked « [test e2e] ») and a real
 * model cost. Neon is NEVER written to (the catalogue refuses it).
 *
 * ⚠️⚠️ THE E2E BENCH MUST RUN IN SERIES (workers=1, DO NOT ADD `E2E_PARALLEL=1`).
 * Each app adopts a COPY of the same OAuth store; the remote connectors
 * (notion, airtable, tavily…) ROTATE the refresh token on every connection.
 * Several apps refreshing the same token in parallel trigger the provider's REUSE
 * detection, which REVOKES the token family — the connector becomes unreachable
 * until a manual re-authorisation in the dev app. (Measured diagnosis: notion/airtable
 * connected on the 1st isolated run, dead after 36 parallel runs.)
 * The on-device OAuth ones (gmail/calendar) are more tolerant but DO NOT bet on it. */

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { KEY } from "./workflows/env";
import {
  appendEvalIndex,
  assertConnectorsAvailable,
  expectAllCompleted,
  expectNoDoubleOutwardAction,
  labConfirms,
  labReport,
  launchRealApp,
  REAL,
  REAL_PII,
  runLab,
  seedRealSession,
  selectGroups,
  startSelectiveApprove,
  TEST_RECIPIENT,
  waitForRealTools,
  writeEvalReport,
  type EvalMode,
} from "./workflows/real";

const MODE = (process.env.E2E_EVAL_MODE as EvalMode) || "fixtures";
const MODELS = (
  process.env.E2E_MODELS ||
  "poolside/laguna-xs-2.1,openai/gpt-oss-120b,qwen/qwen3-30b-a3b-instruct-2507"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const GROUPS = selectGroups(process.env.E2E_EVAL_FAMILY, process.env.E2E_EVAL_ONLY);

test.describe(`Bench agentique — ${MODE}`, () => {
  test.skip(!REAL || !KEY, "E2E_REAL=1 + OPENROUTER_API_KEY requis");

  for (const model of MODELS) {
    for (const group of GROUPS) {
      test(`${MODE} · ${model} · ${group.id}`, async () => {
        test.setTimeout(900_000);
        const at = new Date().toISOString().slice(0, 19).replace("T", " ");
        const { app, page, wireLog, cleanup } = await launchRealApp(
          `${MODE}-${model.replace(/[^\w]+/g, "-")}-${group.id}`,
          { connectors: group.connectors, mode: MODE },
        );
        const approver = startSelectiveApprove(app, page, null);
        let keepLogs = true;
        try {
          await seedRealSession(page);
          await waitForRealTools(page, group.needsTool);
          // Every connector of the group, not only the one at the sync point.
          await assertConnectorsAvailable(page, group.connectors);

          const results = await runLab(page, group.prompts, { modelId: model });
          const confirms = await labConfirms(page);
          console.log(`\n── ${MODE} · ${model} · ${group.id} ──\n${labReport(results)}\n`);

          const run = {
            mode: MODE,
            model,
            group: group.id,
            family: group.family,
            connectors: group.connectors,
            results,
            confirms: confirms.map((c) => ({ tool: c.tool, approved: c.approved })),
            at,
          };
          const path = writeEvalReport(run);
          appendEvalIndex(run);
          test.info().annotations.push({ type: "rapport", description: path });

          /* ── The INVARIANTS: what must hold whatever the model. The rest
             (loops, silences, durations) is MEASURED, not asserted — that is the
             bench's material, a weak model must not turn the suite red. ── */

          // 1. No turn stays stuck (the app must always HAND BACK control).
          expectAllCompleted(results);

          // 2. Nothing REAL in the clear on the wire — the known sentinels (real account
          //    values) are the HARD assertion: redaction must have replaced them, on
          //    every request (the router included).
          const wire = existsSync(wireLog) ? readFileSync(wireLog, "utf8") : "";
          expect(wire.length, "aucune requête wire capturée").toBeGreaterThan(0);
          for (const pii of REAL_PII)
            expect(wire, `PII réelle en clair sur le wire : ${pii}`).not.toContain(pii);
          // SOFT signal (reported, non-blocking): a displayed e-mail that reappears on
          // the wire. It MAY be a real leak — but a model sometimes INVENTS an address
          // (« monemail@exemple.com ») that was never redacted and legitimately appears
          // on both sides; without the vault, the spec cannot tell the two apart. The
          // real anti-leak guard is REAL_PII above + the redaction pipeline (unit
          // tested). Here we only LIST for inspection.
          const echoed = [
            ...new Set(results.flatMap((r) => r.text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g) ?? [])),
          ].filter((e) => wire.includes(e));
          if (echoed.length)
            test.info().annotations.push({ type: "e-mail-écho (à vérifier)", description: echoed.join(", ") });

          // 3. An OUTGOING action at most once per conversation (anti double-send).
          expectNoDoubleOutwardAction(confirms);

          // 4. An e-mail send may target ONLY the test address — never a recipient
          //    pulled from a tool (the args leave in the clear, rule 11).
          for (const c of confirms.filter((c) => /^gmail__/.test(c.tool) && c.approved))
            expect(
              JSON.stringify(c.args ?? {}),
              `envoi confirmé vers un destinataire non autorisé (${c.tool})`,
            ).toContain(TEST_RECIPIENT);

          // 5. Any turn that did not DECLARE its intent to write executed NOTHING
          //    mutating. The filter is on the absence of a declaration (`!== true`), not
          //    on an explicit `false`: the assertion only covered the two Neon prompts,
          //    so the phantom event created on `prep-journee` — a read scenario, with no
          //    annotation — slipped under the radar (log of 27/07/2026).
          for (const r of results.filter((p) => p.approveWrites !== true))
            expect(
              confirms.filter((c) => c.convId === r.convId && c.approved),
              `écriture approuvée sur un tour lecture-seule (${r.id})`,
            ).toEqual([]);

          keepLogs = results.some((r) => r.loopStopped || (!r.tools.length && !r.error));
        } finally {
          await approver.stop();
          await cleanup(keepLogs);
        }
      });
    }
  }
});
