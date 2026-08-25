// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { GMAIL, CRM } from "./servers";
import { calls, mockModel, says, type MockModel } from "./mockModel";
import { runWorkflow, type WorkflowRun } from "./workflow";

// Deep free-mode workflows that don't reduce to a conformance spec: values BORN in tool
// results, and the loop's termination guarantees — both through the real store.

let m: MockModel | undefined;
let run: WorkflowRun | undefined;
afterEach(async () => {
  m?.close();
  m = undefined;
  await run?.dispose();
  run = undefined;
});

const model = () => ({ provider: "openai-compat" as const, modelId: "qwen2.5", baseUrl: m!.url });

describe("values BORN in a tool result", () => {
  it("a real e-mail the user never typed is vaulted from the tool result, echoed as a fake, and RESTORED in the shown answer", async () => {
    m = await mockModel([
      calls({ name: "gmail__list_recent", args: {} }),
      (req) => {
        // Echo the fake address the tool result handed back — what a real model does.
        const tool = req.messages.filter((x) => x.role === "tool").map((x) => x.content).join("\n");
        const fake = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(tool)?.[0] ?? "??";
        return says(`Votre contact principal est ${fake}.`);
      },
    ]);
    run = await runWorkflow({ model: model(), servers: [GMAIL] });
    await run.send("Qui m'a écrit récemment ?");

    // The fixture result contains contact@karl-studio.fr (REAL). It must be: vaulted,
    // faked for the model, and restored in the user's copy.
    expect(run.vaultReals()).toContain("contact@karl-studio.fr");
    expect(run.transcript.leaked(["contact@karl-studio.fr"])).toEqual([]);
    expect(run.lastAssistant()?.content).toContain("contact@karl-studio.fr");
  }, 30_000);
});

describe("termination — the loop must end, and END VISIBLY", () => {
  it("a model stuck repeating the same unproductive call is stopped, and the user gets a real message (not a spinner, not silence)", async () => {
    // 12 scripted identical calls — far past STUCK_STOP. The loop must cut it early.
    const stuck = Array.from({ length: 12 }, () =>
      calls({ name: "hubspot__get_contact", args: { name: "who?" } }),
    );
    m = await mockModel([...stuck, says("jamais atteint")]);
    run = await runWorkflow({
      model: model(), servers: [CRM],
      // The same result every time, so the repeat is UNPRODUCTIVE by the loop's own
      // definition (same args + same result).
      toolResult: () => "Aucun contact trouvé pour cette requête.",
    });
    await run.send("Trouve le contact.");

    const n = run.transcript.dispatched().length;
    expect(n, `la boucle a laissé passer ${n} appels identiques`).toBeLessThanOrEqual(5);
    const last = run.lastAssistant();
    expect(last?.pending, "le tour est resté en attente").toBeFalsy();
    expect(last?.content?.trim(), "aucune explication montrée à l'utilisateur").toBeTruthy();
  }, 30_000);
});
