// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mockModel, says, type MockModel } from "./mockModel";
import { runWorkflow, type WorkflowRun } from "./workflow";

/**
 * STOP during the PRE-MODEL phase (the reported bug « impossible de stopper pendant un
 * tour de réflexion »): the `pending` bubble — hence the Stop button — exists as soon as
 * Send is pressed, but `cancelRef` used to be populated only when the stream or the tool
 * loop dispatched. During redaction (local NER: seconds on a document; remote
 * engine: up to ~45 s), a Stop click was a silent no-op.
 *
 * The harness opens the window with `nerDelayMs` and presses the button inside it
 * (`stopAfter`). The pinned invariants: the bubble RESOLVES (no more infinite
 * spinner), the message says « interrompu » (not a fail-closed failure), and — the
 * confidentiality half — NOTHING left for the model.
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
    run.stopAfter(60); // the NER is in flight — the bug's window
    await run.send("Écris à Jean Vannec de Karl Studio.");

    const a = run.lastAssistant();
    expect(a?.pending).toBe(false); // the bubble is no longer spinning
    expect(a?.errorText ?? "").toMatch(/interrompu/i); // the user stopped it — not a failure
    expect(m.requests).toHaveLength(0); // nothing left for the model
  }, 30_000);

  it("sans Stop, le même envoi aboutit (le délai NER seul ne casse rien)", async () => {
    m = await mockModel([() => says("Bien reçu.")]);
    run = await runWorkflow({ model: model(), ner: NER, nerDelayMs: 100 });
    await run.send("Écris à Jean Vannec.");
    expect(run.lastAssistant()?.content).toContain("Bien reçu");
    expect(m.requests.length).toBeGreaterThan(0);
  }, 30_000);
});
