/**
 * Le moteur « abonnement » : un tour de chat servi par la CLI officielle de
 * l'utilisateur, en mode headless, au lieu d'une clé d'API.
 *
 * L'auth ne passe JAMAIS par nous — la CLI lit son propre trousseau, et ce process ne
 * voit ni jeton, ni cookie, ni identifiant client. C'est la propriété qui fait tenir ce
 * chemin : on n'usurpe rien, on parle à un client installé et licencié par l'utilisateur.
 * Ne pas « optimiser » en allant lire les credentials de la CLI pour appeler l'API
 * directement : ce serait exactement la chose que ce module existe pour éviter.
 *
 * ## Les drapeaux, et pourquoi ceux-là (mesurés sur la CLI 2.1.241)
 *
 * Par défaut la CLI hérite de TOUT l'environnement de développeur de l'utilisateur :
 * ses CLAUDE.md, ses serveurs MCP, ses plugins, ses hooks (l'un d'eux a planté en
 * cherchant `/dev/tty`, absent en headless). Inacceptable pour un moteur de chat
 * embarqué : le comportement dépendrait du poste, et l'environnement privé de
 * l'utilisateur fuiterait dans le produit.
 *
 * Deux drapeaux sont nécessaires et COMPLÉMENTAIRES — chacun rate ce que l'autre attrape :
 *   • `--safe-mode`         coupe CLAUDE.md / mémoire auto / hooks, MAIS laisse les plugins
 *   • `--setting-sources ""` coupe les plugins, MAIS laisse revenir la mémoire auto
 * Mesuré : par défaut 14 serveurs MCP + 2 plugins + mémoire; les deux ensemble ⇒ 0 / 0 / none.
 *
 * ⚠️ **Ne pas remplacer par `--bare`.** Il nettoie davantage mais sa doc est explicite :
 * « Anthropic auth is strictly ANTHROPIC_API_KEY … OAuth and keychain are never read ».
 * Il désactive donc l'abonnement, c'est-à-dire la raison d'être du module. `--safe-mode`,
 * lui, annonce « Auth … work normally » — et `apiKeySource: "none"` le confirme à l'exécution.
 *
 * ⚠️ `--output-format stream-json` EXIGE `--verbose` (erreur sèche sinon).
 *
 * ## Le périmètre d'outils est une ALLOW-LIST — `--tools ""`
 *
 * Un tour de chat n'a besoin d'AUCUN outil intégré de la CLI : ce que le modèle peut
 * appeler, c'est le pont de l'app et rien d'autre (tour outillé), donc rien du tout ici.
 * `--tools ""` dit exactement ça — mesuré sur la 2.1.247 : `system/init` annonce
 * `tools: []`, et les outils du pont MCP survivent au drapeau quand il y en a
 * (`claudeToolsTurn.ts`). C'est une allow-list au sens de la règle 7 : ce qui n'est pas
 * nommé n'existe pas pour le modèle.
 *
 * ⚠️ Ni `--allowedTools` ni `--disallowed-tools` ne peuvent tenir ce rôle, mesuré :
 * le premier ne filtre pas le périmètre (il gouverne la PERMISSION, pas l'existence),
 * le second retire par NOM — donc il ne peut couvrir que ce qu'on a pensé à écrire, et
 * un nom qui change le vide en silence. `CHAT_DISALLOWED_TOOLS` reste posé en
 * ceinture-bretelles, jamais comme la garde ; la garde qui TIENT est `--tools ""`,
 * doublée du filet d'exécution sur `system/init` (`toolGate.ts`).
 */
import type { StreamDone } from "@openmasq/llm";
import { interpretClaudeEvent } from "./claudeStream";
import { streamCliProcess, SubscriptionCliError } from "./spawnStream";

// La boucle spawn/NDJSON/annulation vit dans `spawnStream.ts` (générique, une seule) ;
// ce fichier ne garde que le SPÉCIFIQUE claude : les drapeaux mesurés et l'aiguillage.
export { SubscriptionCliError };

/**
 * La CEINTURE-BRETELLES du périmètre, pas la garde : `--tools ""` (ci-dessus) est ce qui
 * décide, ces noms ne font que redire « non » sur les capacités qu'un usage chat n'a
 * jamais à toucher — écrire sur le disque, exécuter, aller chercher sur le réseau.
 * ⚠️ Ne JAMAIS traiter cette liste comme la protection : elle retire par nom, donc elle
 * ne couvre que ce qu'on a pensé à écrire (règle 7). Y ajouter une ligne ne remplace pas
 * de vérifier que `--tools ""` tient toujours.
 */
export const CHAT_DISALLOWED_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "Task",
  "WebFetch",
  "WebSearch",
  "Read",
  "Glob",
  "Grep",
  "Skill",
  "Workflow",
  "ToolSearch",
  "SendMessage",
] as const;

export interface ClaudeTurnOptions {
  /** Chemin absolu résolu par `resolveCli`. */
  binPath: string;
  prompt: string;
  /** Le prompt système de OpenMasq. Passé en `--system-prompt` (un champ à part sur la
   *  CLI, comme sur l'API Messages), jamais concaténé dans le prompt utilisateur. */
  system?: string;
  /** L'id de conversation OpenMasq, réutilisé comme `--session-id` (doit être un UUID). */
  sessionId: string;
  /** Alias de FAMILLE passé en `--model` (`sonnet`/`opus`/`haiku` — la CLI résout vers le
   *  modèle courant de l'abonnement). Absent ⇒ pas de drapeau : le défaut de la CLI.
   *  Mesuré (25/08) : `--model haiku` cohabite avec les drapeaux d'isolement. */
  model?: string;
  /** Reprendre la session existante plutôt que d'en ouvrir une (2ᵉ message et suivants). */
  resume?: boolean;
  /**
   * Répertoire de travail DÉDIÉ et neutre. Jamais le dossier d'un projet de
   * l'utilisateur : la CLI y chercherait des réglages et des fichiers de contexte.
   */
  cwd: string;
  signal?: AbortSignal;
  onReasoning?: (delta: string) => void;
  /** Quota d'ABONNEMENT atteint (fenêtre 5 h / hebdo) — à afficher tel quel. */
  onRateLimit?: (info: { status: string; resetsAt?: number; windowType?: string }) => void;
}

export function buildClaudeArgs(opts: ClaudeTurnOptions): string[] {
  return [
    "-p",
    opts.prompt,
    ...(opts.system ? ["--system-prompt", opts.system] : []),
    ...(opts.model ? ["--model", opts.model] : []),
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--safe-mode",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    // L'ALLOW-LIST du périmètre : aucun outil intégré pour un tour texte (cf. l'en-tête).
    "--tools",
    "",
    "--disallowed-tools",
    ...CHAT_DISALLOWED_TOOLS,
    ...(opts.resume ? ["--resume", opts.sessionId] : ["--session-id", opts.sessionId]),
  ];
}

/**
 * Un tour claude. Même contrat que `streamAnthropic` dans `@openmasq/llm` (deltas puis
 * `StreamDone`) — la boucle générique est `spawnStream.ts`, ce wrapper n'apporte que
 * les args mesurés et l'interpréteur claude.
 */
export async function* streamClaudeSubscription(
  opts: ClaudeTurnOptions,
): AsyncGenerator<string, StreamDone> {
  return yield* streamCliProcess({
    binPath: opts.binPath,
    args: buildClaudeArgs(opts),
    cwd: opts.cwd,
    interpret: interpretClaudeEvent,
    signal: opts.signal,
    onReasoning: opts.onReasoning,
    onRateLimit: opts.onRateLimit,
  });
}
