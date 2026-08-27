/**
 * La recette CLAUDE du tour outillé : les drapeaux de `claude -p` qui font du pont MCP
 * (`toolsBridge.ts`) la SEULE source d'outils, et le fichier de config qui porte son
 * jeton. Le squelette du tour — refus, aplatissement, course capture/fin — vit dans
 * `toolsTurn.ts` et nulle part ailleurs (règle 9).
 *
 * Drapeaux — l'écart MESURÉ avec le tour simple (`engine.ts`) :
 * - PAS de `--safe-mode` : mesuré (CLI 2.1.246), il coupe les serveurs MCP même passés
 *   explicitement — incompatible avec le pont. L'isolement tient sans lui :
 *   `--setting-sources ""` seul suffit à ne pas lire le CLAUDE.md du cwd (canari mesuré) ;
 *   `--strict-mcp-config` fait du pont la SEULE source MCP (allow-list par construction).
 *   Résiduel assumé : mémoire `~/.claude/CLAUDE.md` et hooks utilisateur, absents de la
 *   machine de mesure — à re-vérifier sur un poste qui en a avant d'élargir.
 * - **`--tools ""` est CE qui borne le périmètre**, comme au tour simple (`engine.ts` en
 *   porte le raisonnement). Mesuré sur la 2.1.247 avec le pont branché : `system/init`
 *   annonce `["mcp__openmasq__<outil>"]` et RIEN d'autre — les outils du pont survivent
 *   au drapeau, les intégrés disparaissent. ⚠️ `--allowedTools` ne borne PAS le périmètre
 *   (mesuré : la liste annoncée est la même avec et sans lui) ; il reste posé pour la
 *   permission, et `--disallowed-tools` en ceinture-bretelles — ni l'un ni l'autre n'est
 *   la garde. Le filet d'exécution qui juge l'annonce est `toolGate.ts`.
 * - Le jeton du pont vit dans le FICHIER de config (0600, dossier jetable), jamais en
 *   argv : la ligne de commande d'un process est lisible par tout process local (`ps`).
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";
import { CHAT_DISALLOWED_TOOLS } from "./engine";
import { interpretClaudeEvent } from "./claudeStream";
import { TOOLS_SERVER_NAME } from "./toolsBridge";
import { cliModelAlias } from "./turn";
import type { ToolsSpawnInput, ToolsSpawnPlan } from "./toolsRecipe";

/** Le fichier `--mcp-config` : le pont est l'UNIQUE serveur, jeton en en-tête. */
function toolsMcpConfig(url: string, token: string): string {
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
    // L'ALLOW-LIST du périmètre : aucun outil intégré, le pont MCP passe quand même.
    "--tools",
    "",
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

export const claudeToolsRecipe = {
  label: "Claude Code",
  interpret: interpretClaudeEvent,
  async prepare(input: ToolsSpawnInput): Promise<ToolsSpawnPlan> {
    // Dossier jetable à préfixe de marque (la convention app-owned du tmp), config 0600 :
    // le jeton n'apparaît ni en argv ni dans un fichier lisible d'un autre compte.
    const dir = await mkdtemp(join(tmpdir(), `${BRAND.slug}-cli-tools-`));
    const mcpConfigPath = join(dir, "mcp.json");
    await writeFile(mcpConfigPath, toolsMcpConfig(input.bridge.url, input.bridge.token), {
      mode: 0o600,
    });
    return {
      args: buildToolsArgs({
        prompt: input.prompt,
        system: input.system,
        model: cliModelAlias(input.modelId),
        sessionId: randomUUID(),
        mcpConfigPath,
        toolNames: input.toolNames,
      }),
      cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
    };
  },
};
