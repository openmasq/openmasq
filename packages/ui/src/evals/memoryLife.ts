import { applyVault, type Vault } from "@openmasq/redact";
import { streamChat, type ProviderId } from "@openmasq/llm";
import type { MemoryData } from "../types";
import {
  emptyMemory,
  extractionPrompt,
  isExplicitMemoryAsk,
  memoryId,
  mergeExtraction,
  parseExtraction,
  resolveExtraction,
  wireSlice,
  worthExtracting,
} from "../memory";
import { mockModel, type MockTurn } from "./mockModel";
import { runWorkflow, type WorkflowRun } from "./workflow";
import type { WorkflowModel } from "./workflowHost";
import type { FakeServer } from "./servers";
import type { ToolArgs } from "./transcript";

/**
 * The Mémoire's LIFE CYCLE — the level above a single scenario: a SUITE of
 * conversations (each a real `runWorkflow`, a real store in jsdom) sharing ONE
 * memory that grows between them, exactly as in the product:
 *
 *   conversation N  →  extraction (the product's PURE pipeline: gate → prompt wire →
 *   parse → anti-hallucination anchor via the vault → merge/dedup)  →  the
 *   enriched memory is SEEDED into conversation N+1 (settings.memoire), where the
 *   injection (`selectMemory`), the forced redaction and `memory_search` are the product's own.
 *
 * In MOCK mode, the agent is scripted (`phase.mock`) and the extractor replies via
 * `phase.extractor(ctx)` — which writes its entities as FAKES (`ctx.fake`), like the real
 * extractor that only ever sees the wire. In REAL mode, agent AND extractor are the same
 * live model.
 */

export interface MemoryPhaseCtx {
  /** The memory AFTER this phase's extraction. */
  memory: MemoryData;
  /** This phase's conversation run (transcript, gates, vault). */
  run: WorkflowRun;
  /** All of the phase's model:in, flattened (system included) — the FULL wire. */
  wire: string;
  /** true = live model (EXACT-count asserts must be relaxed). */
  live: boolean;
}

export interface MemoryPhase {
  name: string;
  prompts: string[];
  ner?: Record<string, string>;
  servers?: FakeServer[];
  toolResult?: (name: string, args: ToolArgs) => string | undefined;
  approveWrites?: boolean;
  /** Mock-mode agent script (one conversation = one dedicated mock server). */
  mock: MockTurn[];
  /** The EXTRACTOR's scripted reply (mock mode) — `ctx.fake(real)` renders a value's
   *  wire form, like the real extractor that replies in fakes. Absent ⇒ nothing
   *  to retain (`{"profil":null,"faits":[]}`). */
  extractor?: (ctx: { wire: string; fake: (real: string) => string }) => string;
  /** GROWS the memory before the phase (background noise, test cards). */
  growBefore?: (memory: MemoryData) => MemoryData;
  /** The phase's asserts — a throw fails it. */
  expect: (ctx: MemoryPhaseCtx) => void;
}

export interface MemoryLifeScenario {
  name: string;
  phases: MemoryPhase[];
}

/** Real extraction: a PLAIN model call (system+user), the same contract as the
 *  product's hook (`useMemoryExtraction`) — accumulated streaming, never a fatal exception. */
async function liveExtract(model: WorkflowModel, system: string, user: string): Promise<string> {
  try {
    const gen = streamChat({
      provider: model.provider as ProviderId,
      model: model.modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      apiKey: model.apiKey ?? "mock-key",
      baseUrl: model.baseUrl,
      temperature: 0,
    });
    let acc = "";
    // Hard cap (60s): a stalling endpoint must not turn a phase into a
    // 170s wait — an extraction rendered partial/empty counts as "nothing learned".
    const deadline = Date.now() + 60_000;
    const timeout = new Promise<{ done: true; value: undefined }>((r) =>
      setTimeout(() => r({ done: true, value: undefined }), 60_000),
    );
    let r = await Promise.race([gen.next(), timeout]);
    while (!r.done && Date.now() < deadline) {
      acc += r.value;
      r = await Promise.race([gen.next(), timeout]);
    }
    return acc;
  } catch {
    return ""; // failed extraction = "nothing learned", never a broken sequel
  }
}

export interface MemoryLifeResult {
  memory: MemoryData;
  /** One row per phase: name + ✅/failure message (the 1st red phase also throws). */
  rows: { phase: string; ok: boolean; error?: string; ms: number }[];
}

export async function runMemoryLife(
  sc: MemoryLifeScenario,
  opts: { model?: WorkflowModel; softFail?: boolean } = {},
): Promise<MemoryLifeResult> {
  let memory = emptyMemory();
  const live = !!opts.model;
  const rows: MemoryLifeResult["rows"] = [];
  for (const phase of sc.phases) {
    const t0 = Date.now();
    if (phase.growBefore) memory = phase.growBefore(memory);
    const mockSrv = opts.model ? undefined : await mockModel(phase.mock);
    const model: WorkflowModel =
      opts.model ?? { provider: "openai-compat", modelId: "qwen2.5", baseUrl: mockSrv!.url };
    const run = await runWorkflow({
      model,
      servers: phase.servers,
      ner: phase.ner,
      approveWrites: phase.approveWrites,
      toolResult: phase.toolResult,
      // The accumulated memory is SEEDED the way the product would read it (settings.memoire):
      // the injection, the forced-redaction and the `memory_search` offer follow for real.
      settings: { memoire: memory },
    });
    let error: string | undefined;
    try {
      for (const p of phase.prompts) await run.send(p);

      // ── Post-conversation extraction: the product's PURE pipeline, not a copy ──
      const realText = phase.prompts.join("\n");
      const kinds = Object.fromEntries(Object.entries(phase.ner ?? {}));
      const explicit = isExplicitMemoryAsk(realText);
      if (worthExtracting({ userTexts: phase.prompts, kinds })) {
        const vault = run.vault() as Vault;
        const wire = wireSlice(phase.prompts, vault);
        const { system, user } = extractionPrompt(wire, { explicit });
        const reply = opts.model
          ? await liveExtract(opts.model, system, user)
          : (phase.extractor?.({ wire, fake: (real) => applyVault(real, vault, new Set()) }) ??
            '{"profil":null,"faits":[]}');
        // Unreadable (no JSON) ⇒ nothing learned — the product itself retries once then
        // FLAGS it (`memoryExtractionRun.ts`); the eval measures the phase as-is.
        const parsed = parseExtraction(reply) ?? { facts: [] };
        for (const f of parsed.facts) f.id = memoryId();
        const resolved = resolveExtraction(parsed, vault, realText, { allowNotes: explicit });
        memory = mergeExtraction(memory, resolved).data;
      }

      const wire = run.transcript.events
        .flatMap((e) => (e.t === "model:in" ? e.messages.map((m) => `[${m.role}] ${m.content}`) : []))
        .join("\n");
      phase.expect({ memory, run, wire, live });
      rows.push({ phase: phase.name, ok: true, ms: Date.now() - t0 });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      rows.push({ phase: phase.name, ok: false, error, ms: Date.now() - t0 });
    } finally {
      await run.dispose();
      mockSrv?.close();
    }
    // A red phase invalidates the following ones (the expected memory doesn't exist) —
    // in soft mode (scored eval) we continue anyway to measure each phase.
    if (error && !opts.softFail) throw new Error(`phase « ${phase.name} » : ${error}`);
  }
  return { memory, rows };
}
