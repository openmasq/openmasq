/* Workflows RÉELS — les VRAIS connecteurs du compte dev, le modèle PAYANT sur
   lequel les incidents du dossier `tofix/` ont été observés. Chaque test rejoue un
   incident vécu et épingle l'invariant qu'il a violé :

     1. PRIVACY : les résultats des vrais outils (emails d'utilisateurs en base,
        rapports PostHog, erreurs Sentry…) repartent REDACTED au modèle — aucune
        sentinelle `REAL_PII` sur le wire, sur AUCUNE requête (routeur compris).
     2. ANTI-DOUBLE-ENVOI : une écriture sortante (message Slack, ticket Linear)
        est confirmée sur la fenêtre système AU PLUS UNE fois — l'incident « échec
        à mi-parcours → 2 envois » se matérialiserait en 2ᵉ confirmation.
     3. NEON READ-ONLY : toute confirmation d'écriture `neon__*` est REFUSÉE (la
        sentinelle write-deny) — le gate fail-closed est la preuve ET le frein.
     4. ABOUTISSEMENT : le tour se termine (le « routeur vide → boucle sans fin »
        d'errorbrowser.md serait un timeout ici).

   Gating : `E2E_REAL=1` + `OPENROUTER_API_KEY` + le store MCP du compte dev
   présent sur la machine (`workflows/real.ts` — copié dans un profil jetable,
   effacé après le run). ⚠️ COÛT RÉEL (modèle payant, quelques centimes) et
   ÉCRITURES RÉELLES sur le workspace dev (marquées [test e2e]) — jamais en CI,
   lancement manuel : `E2E_REAL=1 pnpm e2e:real`. */

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

        // ABOUTISSEMENT : un tour qui ne se termine jamais EST l'incident (etf-pea).
        // Au timeout : l'état du bubble + un screenshot + le wire log conservé.
        const reply = await awaitTurnEnd(page, 360_000).catch(async (e) => {
          const shot = resolve(tmpdir(), `openmasq-real-${wf.id}-timeout.png`);
          await page.screenshot({ path: shot }).catch(() => {});
          throw new Error(
            `tour jamais terminé (360s) — état: ${await turnState(page)} — screenshot: ${shot} — wire: ${wireLog}\n${e}`,
          );
        });
        // Un tour qui a ÉCHOUÉ (carte « ENVOI IMPOSSIBLE », 401…) est un échec du
        // test — avec le texte d'erreur comme diagnostic, pas un timeout muet.
        expect(reply.failed, `tour en échec : ${reply.text}`).toBe(false);
        test.info().annotations.push({
          type: "réponse",
          description: `ok · ${Math.round(reply.ms / 1000)}s · ${reply.text.slice(0, 160)}`,
        });

        // PRIVACY : les sentinelles réelles ne sont sur AUCUNE requête du wire.
        const wire = existsSync(wireLog) ? readFileSync(wireLog, "utf8") : "";
        expect(wire.length, "aucune requête wire capturée").toBeGreaterThan(0);
        for (const pii of REAL_PII)
          expect(wire, `PII réelle en clair sur le wire : ${pii}`).not.toContain(pii);

        // PRIVACY, la version GÉNÉRIQUE — celle qui vaut pour des données qu'on ne
        // connaît pas d'avance (les utilisateurs en base, les rapports, les erreurs) :
        // tout e-mail que l'app AFFICHE est une valeur RÉELLE (l'affichage est
        // un-redacted) ; s'il apparaît AUSSI verbatim sur le wire, c'est une fuite.
        // Le pendant sain est invisible ici par construction : le modèle n'a vu que
        // le faux, et le faux n'atteint jamais l'écran.
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
        // NEON READ-ONLY : rien d'interdit n'a été approuvé (le refus est la preuve).
        if (wf.refuse)
          for (const [tool] of approved)
            expect(wf.refuse.test(tool), `écriture interdite approuvée : ${tool}`).toBe(false);
        // ANTI-DOUBLE-ENVOI : 1 confirmation système = 1 exécution (l'approbateur ne
        // clique jamais « Toujours pour cet outil ») — donc `max` borne l'exécution.
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
        await cleanup(failed); // échec ⇒ garder le wire log (redacté) pour l'autopsie
      }
    });
  }
});
