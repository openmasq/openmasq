/* Agentic workflows against the REAL OpenRouter API (real key, free model by
   default → zero cost). Each test emulates real usage: the user types a
   "workflow" prompt (email, calendar, CRM…) and the app runs its reality — tool
   offering, model tool-calls, arg de-redaction toward the connector, re-redaction of
   results, main's write gate — or its FALLBACK when the model can't call
   tools.

   Parameters (env):
     OPENROUTER_API_KEY   required (root .env) — otherwise the whole suite is skipped.
     E2E_MODEL            model id (default: google/gemma-4-26b-a4b-it:free —
                          "Gemma 4 26B A4B (free)"). ⚠️ OpenRouter's Gemma models
                          are `noTools` (400 on any `tools` request): with the
                          default, the suite verifies the FALLBACK with no connectors — that's
                          the reality of a user on this model. To exercise
                          tool-calls, pass a free tools-capable one, e.g.
                          E2E_MODEL="openai/gpt-oss-20b:free".
     E2E_TOOL_FIXTURES    "0" = mode WITHOUT fixtures (no connector — the reality of an
                          account that has connected nothing). Default: fixtures active
                          (e2e/fixtures/mcp/workflows.json via the main hook
                          OPENMASQ_E2E_MCP_FIXTURES).
     E2E_PARALLEL         "1" = tests in parallel (one app/profile per test).
     E2E_STRICT           "1" = CONTENT assertions (soft) on the answer — otherwise
                          only the deterministic assertions (privacy, tool-calls,
                          gate) apply, small free models rephrasing
                          too freely to pin the text.

   Invariants ALWAYS checked (deterministic):
     1. The wire (chat:start + tool turns) NEVER contains the fixtures' PII
        nor the email typed by the user — only fakes (`patterns` engine).
     2. A write tool only executes after approval on the non-spoofable main
        window (the test clicks "Allow" like a human).
     3. Rule 11: the outgoing argument reaches the connector IN THE CLEAR (the fixtures'
        tool-call log records the real recipient, not the fake). */

import { test, expect } from "@playwright/test";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { awaitReply } from "./helpers";
import { FIXTURES, KEY, MODEL, MODEL_HAS_TOOLS, STRICT, TEMPLATES } from "./workflows/env";
import { FIXTURE_PII, REAL_TO, WORKFLOWS } from "./workflows/catalog";
import { TEMPLATE_WORKFLOWS } from "./workflows/templates";
import {
  launchWorkflowApp,
  seedSession,
  selectModel,
  submitPrompt,
  startAutoApprove,
  waitForFixtureTools,
  readJsonl,
} from "./workflows/harness";

// Parallelism is driven by the CONFIG (playwright.config.ts: E2E_PARALLEL=1 →
// fullyParallel + N workers) — each test launches its own isolated app/profile, so it's safe.
test.describe(`Workflows OpenRouter — ${MODEL} — ${FIXTURES ? "avec" : "sans"} fixtures`, () => {
  test.skip(!KEY, "OPENROUTER_API_KEY absent du .env racine — suite live skippée");

  // Shipped models only join the suite under E2E_TEMPLATES=1 (cost).
  for (const wf of [...WORKFLOWS, ...(TEMPLATES ? TEMPLATE_WORKFLOWS : [])]) {
    test(wf.id, async () => {
      test.setTimeout(300_000);
      const { app, page, profile, wireLog, callLog } = await launchWorkflowApp(wf.id);
      const approver = startAutoApprove(app, page);
      try {
        await seedSession(page);
        if (FIXTURES) await waitForFixtureTools(page);
        await selectModel(page);
        // No "new conversation" click: on boot the app is already on the
        // welcome screen of an empty conversation, whose composer IS the welcome one
        // (`.welcome-composer` — the overlay intercepts clicks on `.btn-new`).
        await submitPrompt(page, wf.prompt);
        let { text: answer, errored } = await awaitReply(page, 240_000);
        // Reality of :free models — an EMPTY answer arrives (overload). The app shows
        // a "Retry" button; a human clicks it. Only one retry.
        if (errored && /aucune réponse/i.test(answer)) {
          const retry = page.getByRole("button", { name: /Réessayer/i }).first();
          if (await retry.count().catch(() => 0)) {
            await retry.click().catch(() => {});
            ({ text: answer, errored } = await awaitReply(page, 240_000));
          }
        }
        expect(errored, `réponse en erreur: ${answer}`).toBe(false);
        expect(answer.length).toBeGreaterThan(0);

        const wire = existsSync(wireLog) ? readFileSync(wireLog, "utf8") : "";
        const calls = readJsonl<{ server: string; tool: string; arguments: Record<string, unknown> }>(callLog);

        // ── (1) privacy: no PII (fixtures OR typed) on ANY wire ──
        for (const v of [...FIXTURE_PII, REAL_TO]) {
          expect(wire, `PII en clair sur le wire: ${v}`).not.toContain(v);
        }

        // Tool-calling capability is decided by the APP on OpenRouter's DYNAMIC
        // catalog (`supported_parameters`), which can contradict the static registry
        // (Gemma models are marked noTools there, but the live catalog declares them capable). So we
        // assert the invariants of the path that ACTUALLY occurred; the
        // static registry only serves to require tool-calls when it promises them.
        if (FIXTURES && (calls.length > 0 || MODEL_HAS_TOOLS)) {
          // ── (2) the model actually used the connectors ──
          expect(
            calls.length,
            `aucun tool-call — le modèle ${MODEL} n'a appelé aucun outil`,
          ).toBeGreaterThan(0);
          if (wf.servers.length === 0) {
            // Tool-less prompt (drafting, extracting a paste): the expected reality
            // is a simple flow. A tool call here would be a model going to fetch
            // in the user's data something it wasn't asked for.
            expect
              .soft(calls, `${wf.id} : aucun outil ne devrait être appelé`)
              .toHaveLength(0);
          } else {
            expect
              .soft(
                calls.some((c) => wf.servers.includes(c.server)),
                `aucun appel vers ${wf.servers.join("/")} — outils appelés: ${calls.map((c) => `${c.server}__${c.tool}`).join(", ")}`,
              )
              .toBe(true);
          }

          // ── (3) a write only reaches the connector after approval ──
          // (the names follow the REAL tools — see fixtures/mcp/workflows.json)
          const wroteTools = calls.filter((c) =>
            ["send_email", "create_draft", "create_event", "create-note", "asana_create_task"].includes(
              c.tool,
            ),
          );
          if (wf.write && wroteTools.length > 0) {
            expect(
              approver.approvedCount(),
              "un outil d'écriture a tourné sans aucune confirmation cliquée",
            ).toBeGreaterThan(0);
            // …and on the RIGHT surface. The direction that matters is this one: a write
            // classified as risky must NEVER be confirmable from the renderer's
            // card, which an XSS could click. The reverse (a local gesture that opens
            // a system window) is only a nuisance, so the assertion is asymmetric.
            if (wf.write === "system") {
              expect(
                approver.systemCount(),
                `${wf.id} : écriture risquée — la fenêtre main non-spoofable doit avoir confirmé`,
              ).toBeGreaterThan(0);
            } else {
              expect(
                approver.chatCount(),
                `${wf.id} : geste local — la carte in-conversation doit avoir confirmé`,
              ).toBeGreaterThan(0);
              expect
                .soft(
                  approver.systemCount(),
                  `${wf.id} : un geste local ne devrait pas interrompre par une fenêtre système`,
                )
                .toBe(0);
            }
          }

          // ── (4) rule 11: the outgoing arg is the REAL one, not the fake ──
          const sent = calls.find((c) => c.tool === "send_email");
          if (wf.id === "send-email" && sent) {
            expect(String(sent.arguments.to), "le connecteur doit recevoir le VRAI destinataire").toBe(REAL_TO);
          }

          if (STRICT) {
            for (const h of wf.contentHints) expect.soft(answer, `contenu attendu: ${h}`).toMatch(h);
          }
        } else {
          // noTools model (Gemma default) OR no-fixtures mode: the reality is a
          // simple-flow fallback — NO tool should have been called.
          expect(calls.length, "aucun tool-call attendu dans ce mode").toBe(0);
        }
      } finally {
        await approver.stop();
        await app.close().catch(() => {});
        rmSync(profile, { recursive: true, force: true });
        // The logs (test PII) stay in tmpdir for debugging a failure; the OS purges them.
      }
    });
  }
});
