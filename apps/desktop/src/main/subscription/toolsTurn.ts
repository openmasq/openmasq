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
 * Drapeaux — l'écart MESURÉ avec le tour simple (`engine.ts`) :
 * - PAS de `--safe-mode` : mesuré (CLI 2.1.246), il coupe les serveurs MCP même passés
 *   explicitement — incompatible avec le pont. L'isolement tient sans lui :
 *   `--setting-sources ""` seul suffit à ne pas lire le CLAUDE.md du cwd (canari mesuré) ;
 *   `--strict-mcp-config` fait du pont la SEULE source MCP (allow-list par construction) ;
 *   `--allowedTools mcp__…` n'autorise que NOS outils ; `--disallowed-tools` retire les
 *   intégrées comme au tour simple. Résiduel assumé : mémoire `~/.claude/CLAUDE.md` et
 *   hooks utilisateur, absents de la machine de mesure — à re-vérifier sur un poste qui
 *   en a avant d'élargir.
 * - Le jeton du pont vit dans le FICHIER de config (0600, dossier jetable), jamais en
 *   argv : la ligne de commande d'un process est lisible par tout process local (`ps`).
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage, CompleteToolsResult, StreamDone, ToolDef } from "@openmasq/llm";
import { BRAND } from "@openmasq/branding";
import { flattenForCli, hasUnsupportedAttachments } from "./bridge";
import { cliModelAlias, type SubscriptionTurnEnv } from "./turn";
import { CHAT_DISALLOWED_TOOLS } from "./engine";
import { interpretClaudeEvent } from "./claudeStream";
import { streamCliProcess } from "./spawnStream";
import { startToolsBridge, type CapturedToolCall } from "./toolsBridge";

/** Le nom du serveur dans le config MCP — la CLI préfixe chaque outil `mcp__<nom>__`. */
export const TOOLS_SERVER_NAME = "openmasq";

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

/** Le fichier `--mcp-config` : le pont est l'UNIQUE serveur, jeton en en-tête. */
export function toolsMcpConfig(url: string, token: string): string {
  return JSON.stringify({
    mcpServers: {
      [TOOLS_SERVER_NAME]: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  });
}

export function buildToolsArgs(opts: {
  prompt: string;
  system?: string;
  model?: string;
  sessionId: string;
  mcpConfigPath: string;
  toolNames: string[];
}): string[] {
  return [
    "-p",
    opts.prompt,
    ...(opts.system ? ["--system-prompt", opts.system] : []),
    ...(opts.model ? ["--model", opts.model] : []),
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    opts.mcpConfigPath,
    "--allowedTools",
    opts.toolNames.map((n) => `mcp__${TOOLS_SERVER_NAME}__${n}`).join(","),
    "--disallowed-tools",
    ...CHAT_DISALLOWED_TOOLS,
    "--session-id",
    opts.sessionId,
  ];
}

/**
 * Un tour `completeTools` sur l'abonnement. Refus AVANT tout spawn (mêmes messages que
 * le tour simple) ; capture ⇒ `{toolCalls}` ; fin de flux sans appel ⇒ `{text}`.
 */
export async function completeSubscriptionTools(
  env: SubscriptionTurnEnv,
  opts: SubscriptionToolsTurnOptions,
): Promise<CompleteToolsResult> {
  if (hasUnsupportedAttachments(opts.messages)) {
    throw new Error(
      "Le modèle « Claude Code » ne prend pas encore les pièces jointes — " +
        "envoyez du texte, ou choisissez un modèle avec vision.",
    );
  }
  const { system, prompt } = flattenForCli(renderToolHistory(opts.messages));
  if (!prompt) throw new Error("Rien à envoyer : la conversation ne contient aucun message.");

  const bridge = await startToolsBridge(opts.tools);
  // Dossier jetable à préfixe de marque (la convention app-owned du tmp), config 0600 :
  // le jeton n'apparaît ni en argv ni dans un fichier lisible d'un autre compte.
  const dir = await mkdtemp(join(tmpdir(), `${BRAND.slug}-cli-tools-`));
  const mcpConfigPath = join(dir, "mcp.json");
  await writeFile(mcpConfigPath, toolsMcpConfig(bridge.url, bridge.token), { mode: 0o600 });

  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);

  let text = "";
  let captured: CapturedToolCall | null = null;

  const run = (async (): Promise<StreamDone> => {
    const it = streamCliProcess({
      binPath: env.binPath,
      args: buildToolsArgs({
        prompt,
        system,
        model: cliModelAlias(opts.modelId),
        sessionId: randomUUID(),
        mcpConfigPath,
        toolNames: opts.tools.map((t) => t.name),
      }),
      cwd: env.cwd,
      interpret: interpretClaudeEvent,
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
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
