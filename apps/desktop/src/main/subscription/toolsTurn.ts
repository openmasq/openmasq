/**
 * Le tour OUTILLÉ de l'abonnement : la primitive `completeTools` servie par la CLI de
 * l'utilisateur — même contrat que `completeWithTools` (@openmasq/llm), pour que la
 * boucle agentique de OpenMasq pilote ce chemin EXACTEMENT comme un modèle API.
 *
 * Principe (boucle inversée) : la CLI reçoit le catalogue d'outils du tour via le pont
 * MCP (`toolsBridge`), mais le pont n'EXÉCUTE rien — il capture le premier appel et ce
 * tour tue la CLI aussitôt, rendant `{toolCalls}` à la boucle. Celle-ci un-redacted,
 * passe la porte d'écriture, exécute, re-redacted — comme toujours — puis re-soumet
 * l'historique complet ici. Sans état, comme tous les autres providers : la session CLI
 * est jetable, OpenMasq reste la source de vérité de sa conversation.
 *
 * CE fichier est le SQUELETTE, une seule fois pour toutes les CLI (règle 9) : refus
 * fail-closed, aplatissement, pont, course « capture ⇄ fin de flux », nettoyage. Ce qui
 * varie d'une CLI à l'autre — les drapeaux, la façon de lui donner le pont et son jeton,
 * l'interpréteur d'événements — est une RECETTE, et rien d'autre :
 * `claudeToolsTurn.ts` (fichier de config 0600) et `codexToolsTurn.ts` (override `-c` +
 * variable d'environnement). Une 3ᵉ CLI n'ajoute qu'une recette.
 */
import { randomUUID } from "node:crypto";
import type { ChatMessage, CompleteToolsResult, StreamDone, ToolDef } from "@openmasq/llm";
import { flattenForCli, hasUnsupportedAttachments } from "./bridge";
import { claudeToolsRecipe } from "./claudeToolsTurn";
import { codexToolsRecipe } from "./codexToolsTurn";
import type { SubscriptionTurnEnv } from "./turn";
import { streamCliProcess } from "./spawnStream";
import { startToolsBridge, type CapturedToolCall } from "./toolsBridge";
import type { ToolsCliRecipe, ToolsSpawnPlan } from "./toolsRecipe";

/** Une CLI d'abonnement = une recette. L'absence de `cli` vaut `claude` (l'historique). */
const RECIPES: Record<NonNullable<SubscriptionTurnEnv["cli"]>, ToolsCliRecipe> = {
  claude: claudeToolsRecipe,
  codex: codexToolsRecipe,
};

/** Un tour outillé qui ne rend rien en 5 min est mort, pas lent — on tue (fail closed). */
const TURN_TIMEOUT_MS = 300_000;

export interface SubscriptionToolsTurnOptions {
  messages: ChatMessage[];
  tools: ToolDef[];
  modelId?: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onReasoning?: (delta: string) => void;
}

/**
 * L'historique d'outils, rendu LISIBLE dans le transcript aplati : le modèle CLI doit
 * voir ses appels passés et leurs résultats (redacted) comme un modèle API les voit
 * dans `messages`. Un tour assistant réduit à des `toolCalls` sans texte serait sinon
 * ÉCARTÉ par l'aplatisseur (bloc vide) — le modèle rappellerait le même outil en boucle.
 */
export function renderToolHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !m.toolCalls?.length) return m;
    const calls = m.toolCalls
      .map((c) => `[Appel d'outil : ${c.name}(${JSON.stringify(c.arguments)})]`)
      .join("\n");
    return { ...m, content: [m.content.trim(), calls].filter(Boolean).join("\n") };
  });
}

/**
 * Un tour `completeTools` sur l'abonnement. Refus AVANT tout spawn (mêmes messages que
 * le tour simple) ; capture ⇒ `{toolCalls}` ; fin de flux sans appel ⇒ `{text}`.
 */
export async function completeSubscriptionTools(
  env: SubscriptionTurnEnv,
  opts: SubscriptionToolsTurnOptions,
): Promise<CompleteToolsResult> {
  const recipe = RECIPES[env.cli ?? "claude"];
  if (hasUnsupportedAttachments(opts.messages)) {
    throw new Error(
      `Le modèle « ${env.label ?? recipe.label} » ne prend pas encore les pièces jointes — ` +
        "envoyez du texte, ou choisissez un modèle avec vision.",
    );
  }
  const { system, prompt } = flattenForCli(renderToolHistory(opts.messages));
  if (!prompt) throw new Error("Rien à envoyer : la conversation ne contient aucun message.");

  const bridge = await startToolsBridge(opts.tools);
  let plan: ToolsSpawnPlan;
  try {
    plan = await recipe.prepare({
      bridge,
      toolNames: opts.tools.map((t) => t.name),
      prompt,
      system,
      modelId: opts.modelId,
    });
  } catch (err) {
    bridge.close(); // une recette qui échoue ne laisse pas un port ouvert derrière elle
    throw err;
  }

  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

  let text = "";
  let captured: CapturedToolCall | null = null;

  const run = (async (): Promise<StreamDone> => {
    const it = streamCliProcess({
      binPath: env.binPath,
      args: plan.args,
      cwd: env.cwd,
      extraEnv: plan.extraEnv,
      interpret: recipe.interpret,
      signal: controller.signal,
      onReasoning: opts.onReasoning,
    });
    let r = await it.next();
    while (!r.done) {
      text += r.value;
      opts.onDelta?.(r.value);
      r = await it.next();
    }
    return r.value;
  })();

  try {
    const outcome = await Promise.race([
      run.then((done) => ({ kind: "done" as const, done })),
      bridge.nextCall().then((call) => ({ kind: "call" as const, call })),
    ]);

    if (outcome.kind === "call") {
      captured = outcome.call;
      controller.abort(); // la CLI attend un résultat qui ne viendra pas : on tue.
      await run.catch(() => {}); // sa mort est VOULUE — pas une erreur à remonter
      return {
        text,
        toolCalls: [{ id: `cli_${randomUUID()}`, name: captured.name, arguments: captured.arguments }],
        stopReason: "tool_calls",
      };
    }
    const finish = outcome.done.finish;
    return {
      text,
      toolCalls: [],
      stopReason: finish === "stop" ? "stop" : finish === "length" ? "length" : "other",
      usage: outcome.done.usage,
    };
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onCallerAbort);
    bridge.close();
    await plan.cleanup?.();
  }
}
