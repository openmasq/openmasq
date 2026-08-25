// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mockModel, says, type MockModel } from "./mockModel";
import { runWorkflow, type WorkflowRun } from "./workflow";

/**
 * STOP pendant la phase PRÉ-MODÈLE (le bug rapporté « impossible de stopper pendant un
 * tour de réflexion ») : la bulle `pending` — donc le bouton Stop — existe dès l'appui
 * sur Envoyer, mais `cancelRef` n'était peuplé qu'au dispatch du stream ou de la boucle
 * outils. Pendant le redaction (NER local : des secondes sur un document ; moteur
 * distant : jusqu'à ~45 s), un clic Stop était un no-op silencieux.
 *
 * Le harnais ouvre la fenêtre avec `nerDelayMs` et presse le bouton dedans
 * (`stopAfter`). Les invariants épinglés : la bulle se RÉSOUT (plus de spinner
 * infini), le message dit « interrompu » (pas une panne fail-closed), et — la moitié
 * confidentialité — RIEN n'est parti au modèle.
 */

const NER = { "Jean Vannec": "name", "Karl Studio": "company" };

let m: MockModel | undefined;
let run: WorkflowRun | undefined;
afterEach(async () => {
  m?.close();
  m = undefined;
  await run?.dispose();
  run = undefined;
});

const model = () => ({ provider: "openai-compat" as const, modelId: "qwen2.5", baseUrl: m!.url });

describe("stop pendant la phase pré-modèle", () => {
  it("résout la bulle en « interrompu » et n'appelle JAMAIS le modèle", async () => {
    m = await mockModel([() => says("jamais atteint")]);
    run = await runWorkflow({ model: model(), ner: NER, nerDelayMs: 250 });
    run.stopAfter(60); // le NER est en vol — la fenêtre du bug
    await run.send("Écris à Jean Vannec de Karl Studio.");

    const a = run.lastAssistant();
    expect(a?.pending).toBe(false); // la bulle ne tourne plus
    expect(a?.errorText ?? "").toMatch(/interrompu/i); // l'utilisateur a stoppé — pas une panne
    expect(m.requests).toHaveLength(0); // rien n'est parti au modèle
  }, 30_000);

  it("sans Stop, le même envoi aboutit (le délai NER seul ne casse rien)", async () => {
    m = await mockModel([() => says("Bien reçu.")]);
    run = await runWorkflow({ model: model(), ner: NER, nerDelayMs: 100 });
    await run.send("Écris à Jean Vannec.");
    expect(run.lastAssistant()?.content).toContain("Bien reçu");
    expect(m.requests.length).toBeGreaterThan(0);
  }, 30_000);
});
