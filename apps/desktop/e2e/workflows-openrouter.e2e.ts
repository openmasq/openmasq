/* Workflows agentiques contre la VRAIE API OpenRouter (clé réelle, modèle gratuit par
   défaut → coût nul). Chaque test émule un usage réel : l'utilisateur tape un prompt
   « workflow » (email, agenda, CRM…) et l'app déroule sa réalité — offre d'outils,
   tool-calls du modèle, un-redaction des args vers le connecteur, re-redaction des
   résultats, gate d'écriture main — ou son REPLI quand le modèle ne sait pas appeler
   d'outils.

   Paramètres (env) :
     OPENROUTER_API_KEY   requis (.env racine) — sinon toute la suite est skip.
     E2E_MODEL            id du modèle (défaut: google/gemma-4-26b-a4b-it:free —
                          « Gemma 4 26B A4B (gratuit) »). ⚠️ Les Gemma d'OpenRouter
                          sont `noTools` (400 sur toute requête `tools`) : avec le
                          défaut, la suite vérifie le REPLI sans connecteurs — c'est
                          la réalité d'un utilisateur sur ce modèle. Pour exercer les
                          tool-calls, passer un gratuit tools-capable, p.ex.
                          E2E_MODEL="openai/gpt-oss-20b:free".
     E2E_TOOL_FIXTURES    "0" = mode SANS fixtures (aucun connecteur — réalité d'un
                          compte qui n'a rien connecté). Défaut : fixtures actives
                          (e2e/fixtures/mcp/workflows.json via le hook main
                          OPENMASQ_E2E_MCP_FIXTURES).
     E2E_PARALLEL         "1" = tests en parallèle (un app/profil par test).
     E2E_STRICT           "1" = assertions de CONTENU (soft) sur la réponse — sinon
                          seules les assertions déterministes (privacy, tool-calls,
                          gate) s'appliquent, les petits modèles gratuits reformulant
                          trop librement pour pinner le texte.

   Invariants TOUJOURS vérifiés (déterministes) :
     1. Le wire (chat:start + tours d'outils) ne contient JAMAIS la PII des fixtures
        ni l'email tapé par l'utilisateur — seulement des fakes (moteur `patterns`).
     2. Un outil d'écriture n'est exécuté qu'après approbation sur la fenêtre main
        non-spoofable (le test clique « Autoriser » comme un humain).
     3. Rule 11 : l'argument sortant atteint le connecteur EN CLAIR (le tool-call log
        des fixtures enregistre le vrai destinataire, pas le fake). */

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

// Le parallélisme est piloté par la CONFIG (playwright.config.ts: E2E_PARALLEL=1 →
// fullyParallel + N workers) — chaque test lance son app/profil isolé, donc sûr.
test.describe(`Workflows OpenRouter — ${MODEL} — ${FIXTURES ? "avec" : "sans"} fixtures`, () => {
  test.skip(!KEY, "OPENROUTER_API_KEY absent du .env racine — suite live skippée");

  // Les modèles livrés ne rejoignent la suite que sous E2E_TEMPLATES=1 (coût).
  for (const wf of [...WORKFLOWS, ...(TEMPLATES ? TEMPLATE_WORKFLOWS : [])]) {
    test(wf.id, async () => {
      test.setTimeout(300_000);
      const { app, page, profile, wireLog, callLog } = await launchWorkflowApp(wf.id);
      const approver = startAutoApprove(app, page);
      try {
        await seedSession(page);
        if (FIXTURES) await waitForFixtureTools(page);
        await selectModel(page);
        // Pas de clic « nouvelle conversation » : au boot l'app est déjà sur l'écran
        // d'accueil d'une conversation vide, dont le composer est CELUI de l'accueil
        // (`.welcome-composer` — l'overlay intercepte les clics sur `.btn-new`).
        await submitPrompt(page, wf.prompt);
        let { text: answer, errored } = await awaitReply(page, 240_000);
        // Réalité des modèles :free — une réponse VIDE arrive (surcharge). L'app pose
        // un bouton « Réessayer » ; un humain clique. Une seule relance.
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

        // ── (1) privacy: aucune PII (fixtures OU tapée) sur AUCUN wire ──
        for (const v of [...FIXTURE_PII, REAL_TO]) {
          expect(wire, `PII en clair sur le wire: ${v}`).not.toContain(v);
        }

        // La capacité tool-calling est décidée par l'APP sur le catalogue DYNAMIQUE
        // OpenRouter (`supported_parameters`), qui peut contredire le registre statique
        // (les Gemma y sont marqués noTools, mais le live les déclare capables). On
        // assert donc les invariants du chemin qui s'est RÉELLEMENT produit ; le
        // statique ne sert qu'à exiger des tool-calls quand il les promet.
        if (FIXTURES && (calls.length > 0 || MODEL_HAS_TOOLS)) {
          // ── (2) le modèle a réellement utilisé les connecteurs ──
          expect(
            calls.length,
            `aucun tool-call — le modèle ${MODEL} n'a appelé aucun outil`,
          ).toBeGreaterThan(0);
          if (wf.servers.length === 0) {
            // Prompt sans outil (rédaction, extraction d'un collage) : la réalité attendue
            // est un flux simple. Un appel d'outil ici serait un modèle qui part chercher
            // dans les données de l'utilisateur ce qu'on ne lui a pas demandé.
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

          // ── (3) une écriture n'atteint le connecteur qu'après approbation ──
          // (les noms suivent les VRAIS outils — voir fixtures/mcp/workflows.json)
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
            // …et sur la BONNE surface. Le sens qui compte est celui-ci : une écriture
            // classée risquée ne doit JAMAIS pouvoir se confirmer depuis la carte du
            // renderer, qu'une XSS pourrait cliquer. L'inverse (un geste local qui ouvre
            // une fenêtre système) n'est qu'une nuisance, donc l'assertion est asymétrique.
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

          // ── (4) règle 11 : l'arg sortant est le RÉEL, pas le fake ──
          const sent = calls.find((c) => c.tool === "send_email");
          if (wf.id === "send-email" && sent) {
            expect(String(sent.arguments.to), "le connecteur doit recevoir le VRAI destinataire").toBe(REAL_TO);
          }

          if (STRICT) {
            for (const h of wf.contentHints) expect.soft(answer, `contenu attendu: ${h}`).toMatch(h);
          }
        } else {
          // Modèle noTools (défaut Gemma) OU mode sans fixtures : la réalité est un
          // repli en flux simple — AUCUN outil ne doit avoir été appelé.
          expect(calls.length, "aucun tool-call attendu dans ce mode").toBe(0);
        }
      } finally {
        await approver.stop();
        await app.close().catch(() => {});
        rmSync(profile, { recursive: true, force: true });
        // Les logs (PII de test) restent dans tmpdir pour debug d'un échec ; l'OS les purge.
      }
    });
  }
});
