/**
 * La recette CODEX du tour outillé : comment `codex exec` reçoit le pont MCP
 * (`toolsBridge.ts`) et lui seul. Le squelette du tour — refus, aplatissement, course
 * capture/fin — vit dans `toolsTurn.ts` (règle 9) ; les drapeaux d'isolement, eux,
 * restent dans `codexEngine.ts`, partagés avec le tour texte.
 *
 * Tout ce qui suit est MESURÉ le 26/08/2026 sur la CLI 0.149.1 :
 *
 * - **La config MCP passe par `-c`, et SURVIT à `--ignore-user-config`** : ce drapeau
 *   n'écarte que le `config.toml` du poste, pas les overrides de la ligne de commande.
 *   Le pont est donc l'UNIQUE serveur MCP du tour — l'équivalent du `--strict-mcp-config`
 *   de claude, obtenu par construction plutôt que par un drapeau.
 * - **`default_tools_approval_mode="approve"`** : sans lui, l'appel part et MEURT sur
 *   « MCP tool call requires approval, but approval policy is never » — `codex exec` est
 *   non interactif, personne ne peut répondre à la demande. Approuver ici n'ouvre rien :
 *   le pont CAPTURE l'appel, il ne l'exécute jamais ; ce sont le coffre et la porte
 *   d'écriture de l'app qui décident, comme sur un modèle à clé. (`auto`, mesuré, ne
 *   suffit pas ; les autres valeurs sont `prompt` et `writes`.)
 * - **`enabled_tools=[…]` est une ALLOW-list** (règle 7) : seuls les outils de CE tour
 *   sont exposés, nommés un par un. Rien d'autre n'existe pour le modèle.
 * - **Le jeton passe par une VARIABLE D'ENVIRONNEMENT** (`bearer_token_env_var`), jamais
 *   en argv : la ligne de commande d'un process est lisible par tout process local
 *   (`ps`). L'environnement, lui, ne l'est que par le même compte — la même frontière
 *   que le fichier 0600 du côté claude.
 *
 * ⚠️ La liste `CODEX_DISABLED_FEATURES` compte AUSSI pour ce tour : sans elle, mesuré, à
 * qui demande son Dropbox le modèle tente d'installer un connecteur codex au lieu
 * d'appeler l'outil du pont (l'accès sortirait alors du coffre — règle 11).
 */
import { buildCodexArgs, codexPrompt } from "./codexEngine";
import { interpretCodexEvent } from "./codexStream";
import { TOOLS_SERVER_NAME } from "./toolsBridge";
import type { ToolsSpawnInput, ToolsSpawnPlan } from "./toolsRecipe";

/** La variable d'environnement où la CLI lit le jeton Bearer du pont. Jetable : elle ne
 *  vaut que pour CE process, ce tour, ce port. */
export const CODEX_TOOLS_TOKEN_ENV = "OPENMASQ_TOOLS_TOKEN";

/**
 * L'override `-c` qui déclare le pont : une valeur TOML sur UNE ligne (la CLI parse le
 * `value` en TOML). Chaque chaîne est sérialisée en JSON — un nom d'outil ne peut donc
 * pas casser la table, ni en ouvrir une autre.
 */
export function codexToolsServerConfig(url: string, toolNames: string[]): string {
  const table = [
    `url=${JSON.stringify(url)}`,
    `bearer_token_env_var=${JSON.stringify(CODEX_TOOLS_TOKEN_ENV)}`,
    `default_tools_approval_mode="approve"`,
    `enabled_tools=[${toolNames.map((n) => JSON.stringify(n)).join(",")}]`,
  ].join(",");
  return `mcp_servers.${TOOLS_SERVER_NAME}={${table}}`;
}

export const codexToolsRecipe = {
  label: "Codex",
  interpret: interpretCodexEvent,
  // Rien à écrire sur le disque, donc rien à nettoyer : la config tient dans l'argv et
  // le secret dans l'environnement de l'enfant.
  prepare: async (input: ToolsSpawnInput): Promise<ToolsSpawnPlan> => ({
    args: buildCodexArgs({
      prompt: codexPrompt(input.system, input.prompt),
      mcpServerConfig: codexToolsServerConfig(input.bridge.url, input.toolNames),
    }),
    extraEnv: { [CODEX_TOOLS_TOKEN_ENV]: input.bridge.token },
  }),
};
