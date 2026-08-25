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
 * Le CYCLE DE VIE de la Mémoire — le niveau au-dessus d'un scénario : une SUITE de
 * conversations (chacune un vrai `runWorkflow`, store réel en jsdom) partageant UNE
 * mémoire qui grandit entre elles, exactement comme dans le produit :
 *
 *   conversation N  →  extraction (pipeline PUR du produit : gate → prompt wire →
 *   parse → ancrage anti-hallucination via le vault → merge/dédup)  →  la mémoire
 *   enrichie est SEEDÉE dans la conversation N+1 (settings.memoire), où l'injection
 *   (`selectMemory`), le redaction forcé et `memory_search` sont ceux du produit.
 *
 * En mode MOCK, l'agent est scripté (`phase.mock`) et l'extracteur répond via
 * `phase.extractor(ctx)` — qui écrit ses entités en FAKES (`ctx.fake`), comme le vrai
 * extracteur qui ne voit que le wire. En mode RÉEL, agent ET extracteur sont le même
 * modèle vivant.
 */

export interface MemoryPhaseCtx {
  /** La mémoire APRÈS l'extraction de cette phase. */
  memory: MemoryData;
  /** Le run de la conversation de cette phase (transcript, gates, vault). */
  run: WorkflowRun;
  /** Tous les model:in de la phase, aplatis (system inclus) — le WIRE complet. */
  wire: string;
  /** true = modèle vivant (les asserts de COMPTE exact doivent se relâcher). */
  live: boolean;
}

export interface MemoryPhase {
  name: string;
  prompts: string[];
  ner?: Record<string, string>;
  servers?: FakeServer[];
  toolResult?: (name: string, args: ToolArgs) => string | undefined;
  approveWrites?: boolean;
  /** Script agent du mode mock (une conversation = un serveur mock dédié). */
  mock: MockTurn[];
  /** Réponse scriptée de l'EXTRACTEUR (mode mock) — `ctx.fake(réel)` rend la forme
   *  wire d'une valeur, comme le vrai extracteur qui répond en fakes. Absent ⇒ rien
   *  à retenir (`{"profil":null,"faits":[]}`). */
  extractor?: (ctx: { wire: string; fake: (real: string) => string }) => string;
  /** Fait GRANDIR la mémoire avant la phase (bruit de fond, cartes de test). */
  growBefore?: (memory: MemoryData) => MemoryData;
  /** Les asserts de la phase — un throw la fait échouer. */
  expect: (ctx: MemoryPhaseCtx) => void;
}

export interface MemoryLifeScenario {
  name: string;
  phases: MemoryPhase[];
}

/** Extraction réelle : un appel modèle PLAIN (system+user), même contrat que le hook
 *  produit (`useMemoryExtraction`) — streaming accumulé, jamais d'exception fatale. */
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
    // Borne dure (60 s) : un endpoint qui stalle ne doit pas transformer une phase en
    // 170 s d'attente — l'extraction rendue partielle/vide vaut « rien appris ».
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
    return ""; // extraction ratée = « rien appris », jamais une suite cassée
  }
}

export interface MemoryLifeResult {
  memory: MemoryData;
  /** Une ligne par phase : nom + ✅/message d'échec (la 1re phase rouge jette aussi). */
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
      // La mémoire accumulée est SEEDÉE comme le produit la lirait (settings.memoire) :
      // l'injection, le forced-redaction et l'offre `memory_search` suivent en vrai.
      settings: { memoire: memory },
    });
    let error: string | undefined;
    try {
      for (const p of phase.prompts) await run.send(p);

      // ── Extraction post-conversation : le pipeline PUR du produit, pas une copie ──
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
        // Illisible (aucun JSON) ⇒ rien appris — le produit, lui, relance une fois puis
        // le SIGNALE (`memoryExtractionRun.ts`) ; l'éval mesure la phase telle quelle.
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
    // Une phase rouge invalide les suivantes (la mémoire attendue n'existe pas) —
    // en mode soft (éval scorée) on continue quand même pour mesurer chaque phase.
    if (error && !opts.softFail) throw new Error(`phase « ${phase.name} » : ${error}`);
  }
  return { memory, rows };
}
