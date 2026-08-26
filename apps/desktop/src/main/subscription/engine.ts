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
 * ⚠️ `--output-format stream-json` EXIGE `--verbose` (erreur sèche sinon), et
 * `--allowedTools ""` est un no-op : seul `--disallowed-tools <noms…>` retire réellement
 * des outils. Pour du chat grand public on les énumère.
 */
import { spawn } from "node:child_process";
import type { StreamDone, TokenUsage } from "@openmasq/llm";
import { minimalChildEnv } from "../childEnv";
import { NdjsonLineBuffer, interpretClaudeEvent } from "./claudeStream";

/**
 * Les outils retirés pour un usage chat. La CLI en expose 26 par défaut, dont de quoi
 * écrire sur le disque et exécuter des commandes — hors sujet, et dangereux dans un
 * produit grand public où personne ne répond aux demandes de permission (mode headless).
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
    "--disallowed-tools",
    ...CHAT_DISALLOWED_TOOLS,
    ...(opts.resume ? ["--resume", opts.sessionId] : ["--session-id", opts.sessionId]),
  ];
}

/** Erreur portant la sortie d'erreur de la CLI, pour que l'appelant la traduise. */
export class SubscriptionCliError extends Error {
  constructor(
    message: string,
    readonly stderrTail: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "SubscriptionCliError";
  }
}

/**
 * Un tour. Rend les deltas de texte au fil de l'eau et retourne l'usage + la cause de
 * fin, exactement comme `streamAnthropic` dans `@openmasq/llm` — pour que le branchement
 * dans la couche provider soit un simple aiguillage.
 *
 * FAIL-CLOSED : une CLI absente, non authentifiée ou qui meurt REJETTE. On ne rend
 * jamais un flux vide silencieux, qui se lirait comme « le modèle n'a rien répondu ».
 */
export async function* streamClaudeSubscription(
  opts: ClaudeTurnOptions,
): AsyncGenerator<string, StreamDone> {
  const child = spawn(opts.binPath, buildClaudeArgs(opts), {
    cwd: opts.cwd,
    env: minimalChildEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onAbort = () => child.kill("SIGTERM");
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  const lines = new NdjsonLineBuffer();
  const pending: string[] = [];
  let sawDelta = false;
  let done: StreamDone | null = null;
  let failure: Error | null = null;
  let stderrTail = "";
  let resolveTick: (() => void) | null = null;

  const wake = () => {
    resolveTick?.();
    resolveTick = null;
  };

  const consume = (raw: string) => {
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return; // une ligne non-JSON (bruit de démarrage) n'est pas une erreur
    }
    const action = interpretClaudeEvent(event, sawDelta);
    if (!action) return;
    switch (action.kind) {
      case "text":
        sawDelta = true;
        pending.push(action.delta);
        break;
      case "reasoning":
        opts.onReasoning?.(action.delta);
        break;
      case "rateLimit":
        opts.onRateLimit?.(action);
        break;
      case "done":
        done = { usage: action.usage as TokenUsage | undefined, finish: action.finish };
        break;
      case "error":
        failure = new SubscriptionCliError(action.message, stderrTail, null);
        break;
      case "session":
        break;
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    for (const line of lines.push(chunk)) consume(line);
    wake();
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-2000);
  });

  const exited = new Promise<number | null>((resolve) => {
    child.on("error", (err) => {
      failure = new SubscriptionCliError(err.message, stderrTail, null);
      resolve(null);
    });
    child.on("close", (code) => {
      for (const line of lines.flush()) consume(line);
      resolve(code);
    });
  });
  void exited.then(wake);

  let finished = false;
  void exited.then(() => {
    finished = true;
  });

  try {
    while (true) {
      while (pending.length) yield pending.shift() as string;
      if (failure) throw failure;
      if (finished) break;
      await new Promise<void>((r) => {
        resolveTick = r;
      });
    }

    const code = await exited;
    while (pending.length) yield pending.shift() as string;
    if (failure) throw failure;

    if (opts.signal?.aborted) return { finish: "cut" };
    if (code !== 0 && !done) {
      throw new SubscriptionCliError(
        `La CLI s'est arrêtée avec le code ${code ?? "inconnu"}.`,
        stderrTail,
        code,
      );
    }
    // Sortie propre mais aucun `result` : le flux a été coupé, la réponse est tronquée.
    return done ?? { finish: "cut" };
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
  }
}
