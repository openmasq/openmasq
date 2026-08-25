/* LE BANC D'ÉVALUATION AGENTIQUE — matrice MODÈLES × GROUPES, deux bancs séparés.
 *
 *   banc FIXTURES (`E2E_EVAL_MODE=fixtures`, défaut) — résultats d'outils FIGÉS
 *     (`e2e/fixtures/mcp/workflows.json`). Le modèle est réel, les services non :
 *     déterministe, répétable, sans effet de bord. C'est le banc où l'on ITÈRE
 *     sur la guidance, parce qu'un écart avant/après y est imputable au changement.
 *   banc E2E (`E2E_EVAL_MODE=e2e`) — les VRAIS connecteurs du compte dev. Mesure
 *     ce que l'utilisateur vivra, au prix d'écritures réelles et d'une variance
 *     (latence des services, contenu réel des comptes) qui interdit d'y lire un
 *     progrès fin. On y CONFIRME ce que le banc fixtures a montré.
 *
 * Les rapports partent dans `evals-reports/<mode>/<modèle>.md` + un `index.md`.
 *
 * Usage :
 *   E2E_REAL=1 pnpm e2e:evals                              # fixtures, tous modèles, tous groupes
 *   E2E_REAL=1 E2E_EVAL_FAMILY=complexe pnpm e2e:evals     # seulement les chaînes multi-outils
 *   E2E_REAL=1 E2E_EVAL_MODE=e2e E2E_EVAL_ONLY=incident pnpm e2e:evals
 *   E2E_MODELS=poolside/laguna-xs-2.1,openai/gpt-oss-120b  # la matrice
 *
 * ⚠️ Banc e2e = écritures RÉELLES sur le workspace dev (marquées « [test e2e] »)
 * et coût modèle réel. Neon n'est JAMAIS écrit (le catalogue le refuse).
 *
 * ⚠️⚠️ LE BANC E2E DOIT TOURNER EN SÉRIE (workers=1, N'AJOUTE PAS `E2E_PARALLEL=1`).
 * Chaque app adopte une COPIE du même magasin OAuth ; les connecteurs distants
 * (notion, airtable, tavily…) font une ROTATION du refresh token à chaque connexion.
 * Plusieurs apps rafraîchissant le même token en parallèle déclenchent la détection
 * de RÉUTILISATION côté fournisseur, qui RÉVOQUE la famille de tokens — le connecteur
 * devient inaccessible jusqu'à une ré-autorisation manuelle dans l'app dev. (Diagnostic
 * mesuré : notion/airtable connectés au 1er run isolé, morts après 36 runs parallèles.)
 * Les OAuth on-device (gmail/calendar) sont plus tolérants mais NE PAS parier dessus. */

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
          // Tous les connecteurs du groupe, pas seulement celui du point de synchro.
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

          /* ── Les INVARIANTS : ce qui doit tenir quel que soit le modèle. Le reste
             (boucles, silences, durées) est MESURÉ, pas asserté — c'est la matière
             du bench, un modèle faible ne doit pas rendre la suite rouge. ── */

          // 1. Aucun tour ne reste bloqué (l'app doit toujours RENDRE la main).
          expectAllCompleted(results);

          // 2. Rien de RÉEL en clair sur le wire — les sentinelles connues (vraies
          //    valeurs du compte) sont l'assertion DURE : le redaction doit les avoir
          //    remplacées, sur toute requête (routeur compris).
          const wire = existsSync(wireLog) ? readFileSync(wireLog, "utf8") : "";
          expect(wire.length, "aucune requête wire capturée").toBeGreaterThan(0);
          for (const pii of REAL_PII)
            expect(wire, `PII réelle en clair sur le wire : ${pii}`).not.toContain(pii);
          // Signal SOFT (rapporté, non bloquant) : un e-mail affiché qui reparaît sur
          // le wire. Il PEUT être une vraie fuite — mais un modèle INVENTE parfois une
          // adresse (« monemail@exemple.com ») qui n'a jamais été redacted et figure
          // légitimement des deux côtés ; sans le vault, le spec ne peut distinguer les
          // deux. La vraie garde anti-fuite est REAL_PII ci-dessus + le pipeline de
          // redaction (testé unitairement). Ici on ne fait que LISTER pour inspection.
          const echoed = [
            ...new Set(results.flatMap((r) => r.text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g) ?? [])),
          ].filter((e) => wire.includes(e));
          if (echoed.length)
            test.info().annotations.push({ type: "e-mail-écho (à vérifier)", description: echoed.join(", ") });

          // 3. Une action SORTANTE au plus une fois par conversation (anti-double-envoi).
          expectNoDoubleOutwardAction(confirms);

          // 4. Un envoi d'e-mail ne peut viser QUE l'adresse de test — jamais un
          //    destinataire tiré d'un outil (les args partent en clair, règle 11).
          for (const c of confirms.filter((c) => /^gmail__/.test(c.tool) && c.approved))
            expect(
              JSON.stringify(c.args ?? {}),
              `envoi confirmé vers un destinataire non autorisé (${c.tool})`,
            ).toContain(TEST_RECIPIENT);

          // 5. Tout tour qui n'a pas DÉCLARÉ vouloir écrire n'a RIEN exécuté de mutant.
          //    Le filtre porte sur l'absence de déclaration (`!== true`), pas sur un
          //    `false` explicite : l'assertion ne couvrait que les deux prompts Neon,
          //    donc l'événement fantôme créé sur `prep-journee` — scénario de lecture,
          //    sans annotation — passait sous le radar (journal du 27/07/2026).
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
