/* REAL workflows — the dev account's REAL connectors, the PAID model on
   which the `tofix/` folder's incidents were observed. Each test replays a
   real incident and pins the invariant it violated:

     1. PRIVACY: real tools' results (users' emails in the DB,
        PostHog reports, Sentry errors…) go back to the model REDACTED — no
        `REAL_PII` sentinel on the wire, on ANY request (router included).
     2. ANTI-DOUBLE-SEND: an outbound write (Slack message, Linear ticket)
        is confirmed on the system window AT MOST ONCE — the "failure
        midway → 2 sends" incident would materialize as a 2nd confirmation.
     3. NEON READ-ONLY: any `neon__*` write confirmation is REFUSED (the
        write-deny sentinel) — the fail-closed gate is both the proof AND the brake.
     4. COMPLETION: the turn ends (the "empty router → endless loop"
        from errorbrowser.md would be a timeout here).

   Gating: `E2E_REAL=1` + `OPENROUTER_API_KEY` + the dev account's MCP store
   present on the machine (`workflows/real.ts` — copied into a disposable profile,
   erased after the run). ⚠️ REAL COST (paid model, a few cents) and
   REAL WRITES on the dev workspace (marked [test e2e]) — never in CI,
   manual launch: `E2E_REAL=1 pnpm e2e:real`. */

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { KEY } from "./workflows/env";
import { selectModel, submitPrompt } from "./workflows/harness";
import {
  awaitTurnEnd,
  launchRealApp,
  REAL,
  REAL_MODEL,
  REAL_PII,
  seedRealSession,
  startSelectiveApprove,
  turnState,
  waitForRealTools,
} from "./workflows/real";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { REAL_WORKFLOWS } from "./workflows/realCatalog";

test.describe(`Workflows RÉELS — ${REAL_MODEL}`, () => {
  test.skip(
    !REAL || !KEY,
    "E2E_REAL=1 + OPENROUTER_API_KEY requis — vrais connecteurs + modèle payant, lancement manuel uniquement",
  );

  for (const wf of REAL_WORKFLOWS) {
    test(wf.id, async () => {
      test.setTimeout(540_000);
      const { app, page, wireLog, cleanup } = await launchRealApp(wf.id);
      const approver = startSelectiveApprove(app, page, wf.refuse ?? null);
      let failed = true;
      try {
        await seedRealSession(page);
        await waitForRealTools(page, wf.needsTool);
        await selectModel(page, REAL_MODEL);
        await submitPrompt(page, wf.prompt);

        // COMPLETION: a turn that never ends IS the incident (etf-pea).
        // On timeout: the bubble's state + a screenshot + the wire log kept.
        const reply = await awaitTurnEnd(page, 360_000).catch(async (e) => {
          const shot = resolve(tmpdir(), `openmasq-real-${wf.id}-timeout.png`);
          await page.screenshot({ path: shot }).catch(() => {});
          throw new Error(
            `tour jamais terminé (360s) — état: ${await turnState(page)} — screenshot: ${shot} — wire: ${wireLog}\n${e}`,
          );
        });
        // A turn that FAILED (a "SEND IMPOSSIBLE" card, 401…) is a test
        // failure — with the error text as diagnostic, not a silent timeout.
        expect(reply.failed, `tour en échec : ${reply.text}`).toBe(false);
        test.info().annotations.push({
          type: "réponse",
          description: `ok · ${Math.round(reply.ms / 1000)}s · ${reply.text.slice(0, 160)}`,
        });

        // PRIVACY: the real sentinels are on NO request in the wire.
        const wire = existsSync(wireLog) ? readFileSync(wireLog, "utf8") : "";
        expect(wire.length, "aucune requête wire capturée").toBeGreaterThan(0);
        for (const pii of REAL_PII)
          expect(wire, `PII réelle en clair sur le wire : ${pii}`).not.toContain(pii);

        // PRIVACY, the GENERIC version — the one that holds for data we don't
        // know in advance (the users in the DB, the reports, the errors):
        // every email the app DISPLAYS is a REAL value (the display is
        // de-redacted); if it ALSO appears verbatim on the wire, that's a leak.
        // The healthy counterpart is invisible here by construction: the model only saw
        // the fake, and the fake never reaches the screen.
        const shown = await page
          .locator(".msg.assistant")
          .last()
          .innerText()
          .catch(() => "");
        const shownEmails = [...new Set(shown.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g) ?? [])];
        for (const email of shownEmails)
          expect(wire, `e-mail affiché ET envoyé en clair : ${email}`).not.toContain(email);
        test.info().annotations.push({
          type: "privacy",
          description: `${shownEmails.length} e-mail(s) affiché(s), 0 sur le wire`,
        });

        const approved = approver.approved();
        // NEON READ-ONLY: nothing forbidden was approved (the refusal is the proof).
        if (wf.refuse)
          for (const [tool] of approved)
            expect(wf.refuse.test(tool), `écriture interdite approuvée : ${tool}`).toBe(false);
        // ANTI-DOUBLE-SEND: 1 system confirmation = 1 execution (the approver
        // never clicks "Always for this tool") — so `max` bounds the execution.
        for (const w of wf.writes ?? []) {
          const n = [...approved].filter(([t]) => w.tool.test(t)).reduce((s, [, c]) => s + c, 0);
          expect(n, `${w.tool} confirmé ${n}× (max ${w.max}) — double envoi ?`).toBeLessThanOrEqual(
            w.max,
          );
        }
        const refusedNote = [...approver.refused()].map(([t, c]) => `${t}×${c}`).join(", ");
        if (wf.refuse)
          test.info().annotations.push({ type: "refus-neon", description: refusedNote || "aucun (pas d'écriture tentée)" });
        failed = false;
      } finally {
        await approver.stop();
        await cleanup(failed); // failure ⇒ keep the wire log (redacted) for the autopsy
      }
    });
  }
});
