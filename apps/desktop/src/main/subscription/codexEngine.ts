/**
 * Le spécifique CODEX (`codex exec`) du moteur d'abonnement — l'abonnement ChatGPT de
 * l'utilisateur, servi par SA CLI officielle. Boucle : `spawnStream.ts` ; événements :
 * `codexStream.ts`. Tout ce qui suit est MESURÉ le 26/08/2026 sur la CLI 0.149.1.
 *
 * ## Les drapeaux, et pourquoi ceux-là
 *
 * Codex est, des trois CLI branchées, celle qui outille le mieux l'isolement — chaque
 * drapeau ci-dessous a été vérifié à l'exécution :
 *
 * - `--json` : JSONL sur stdout (le flux que `codexStream.ts` lit).
 * - `--ephemeral` : AUCUN fichier de session écrit sur le disque. Une conversation
 *   OpenMasq ne doit pas laisser de trace dans l'historique personnel de la CLI.
 * - `--ignore-user-config` : le `config.toml` de l'utilisateur n'est PAS chargé — donc
 *   ni son modèle, ni ses serveurs MCP, ni ses réglages. ⚠️ Sa doc précise « auth still
 *   uses CODEX_HOME » : l'abonnement continue de fonctionner, c'est exactement le
 *   pendant du `--safe-mode` de claude (isolement SANS casser l'auth).
 * - `--ignore-rules` : pas de `.rules` (execpolicy) utilisateur ou projet.
 * - `--skip-git-repo-check` : le cwd dédié n'est pas un dépôt git, et n'a pas à l'être.
 * - `-s read-only` : sandbox en lecture seule. MESURÉ : une demande de création de
 *   fichier est refusée, rien n'est écrit dans le cwd.
 * - `--disable shell_tool` : **le drapeau qui compte**. Sans lui, `-s read-only` laisse
 *   quand même le modèle EXÉCUTER des commandes (mesuré : `/bin/zsh -lc ls`, un shell
 *   de LOGIN qui source les rc de l'utilisateur) — donc lire n'importe quel fichier
 *   lisible et le ramener dans le contexte. Avec lui, la CLI répond « je n'ai pas accès
 *   à une commande terminal » et aucun `command_execution` n'apparaît dans le flux.
 *   `browser_use`/`computer_use` sont coupés par la même voie, par précaution.
 *
 * ⚠️ **`codex exec` LIT STDIN même quand le prompt est en argument** (« Reading
 * additional input from stdin… ») : sans `stdio[0] = "ignore"`, le process attend
 * indéfiniment — le tour ne rend jamais la main. C'est le piège n°1 de cette CLI ; la
 * boucle générique ignore stdin par construction, ne pas « corriger » ce détail.
 *
 * ⚠️ **`web_search` reste actif** et n'est PAS déconnectable (`tools.web_search=false`
 * mesuré sans effet, aucune feature correspondante). Il s'exécute CÔTÉ SERVEUR : il ne
 * porte que le texte REDACTED du tour, vers le même destinataire que le prompt — pas
 * une nouvelle classe d'egress (règle 11), mais à savoir.
 *
 * ⚠️ **Pas de deltas** : le texte arrive par `agent_message` COMPLET (mesuré : 16 s de
 * silence puis 2 213 caractères). La réponse s'affiche donc d'un bloc, comme un tour
 * non streamé — c'est la limite de cette CLI, pas un défaut de branchement.
 *
 * ## Le modèle
 *
 * Avec un compte ChatGPT, la CLI n'accepte QUE le modèle par défaut du compte : un
 * `-m gpt-5.3-codex` mesuré rend un 400 « model is not supported when using Codex with
 * a ChatGPT account ». On ne passe donc AUCUN `-m` — une entrée unique au catalogue.
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretCodexEvent } from "./codexStream";
import { streamCliProcess } from "./spawnStream";

/** Les capacités coupées pour un usage chat (features `--disable`), UNE liste pour le
 *  tour texte comme pour le tour outillé (règle 9). Trois familles :
 *  exécuter (`shell_tool`, `unified_exec` — l'autre chemin d'exécution de la 0.149),
 *  piloter la machine (`browser_use*`, `computer_use`), et **s'ajouter des accès**
 *  (`apps`, `plugins`, `plugin_sharing`, `remote_plugin`, `tool_suggest`,
 *  `skill_mcp_dependency_install`). Cette dernière famille est celle que la 0.149.1
 *  emprunte spontanément : mesuré, à qui demande son Dropbox le modèle tente d'INSTALLER
 *  un connecteur codex plutôt que d'appeler l'outil du tour — un accès qui sortirait du
 *  coffre de l'app (règle 11) et de sa porte d'écriture. Il tombe donc avant d'exister.
 *  ⚠️ NE PAS y ajouter `code_mode_host` : mesuré, le routeur d'outils de la CLI passe
 *  par lui et le couper fait échouer TOUT appel d'outil MCP (« code-mode host is
 *  disabled »), y compris ceux du pont. */
export const CODEX_DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "computer_use",
  "apps",
  "plugins",
  "plugin_sharing",
  "remote_plugin",
  "tool_suggest",
  "skill_mcp_dependency_install",
] as const;

/** `codex exec` n'a PAS de champ système : il est préfixé au prompt, clairement séparé.
 *  Une seule maison, pour que le tour texte et le tour outillé disent la même chose. */
export function codexPrompt(system: string | undefined, prompt: string): string {
  return system ? `Instructions système :\n${system}\n\n---\n\n${prompt}` : prompt;
}

export interface CodexTurnOptions {
  /** Chemin absolu résolu par `resolveCli`. */
  binPath: string;
  /** Le tour aplati — prompt système DÉJÀ préfixé par `codexPrompt` (pas de champ dédié). */
  prompt: string;
  /** Répertoire de travail DÉDIÉ et neutre — jamais un dossier de l'utilisateur. */
  cwd: string;
  signal?: AbortSignal;
}

export function buildCodexArgs(opts: {
  prompt: string;
  /** L'override `-c mcp_servers.…` du tour OUTILLÉ (`codexToolsTurn.ts`). Absent au tour
   *  texte : sans lui, et avec `--ignore-user-config`, la CLI n'a AUCUN serveur MCP. */
  mcpServerConfig?: string;
}): string[] {
  return [
    "exec",
    opts.prompt,
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    ...CODEX_DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
    ...(opts.mcpServerConfig ? ["-c", opts.mcpServerConfig] : []),
  ];
}

/** Un tour codex — même contrat que `streamClaudeSubscription`. */
export async function* streamCodexSubscription(
  opts: CodexTurnOptions,
): AsyncGenerator<string, StreamDone> {
  return yield* streamCliProcess({
    binPath: opts.binPath,
    args: buildCodexArgs(opts),
    cwd: opts.cwd,
    interpret: interpretCodexEvent,
    signal: opts.signal,
  });
}
