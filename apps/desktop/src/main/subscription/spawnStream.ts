/**
 * La boucle GÉNÉRIQUE d'un tour CLI headless : spawn, NDJSON → actions, annulation,
 * fail-closed. Extraite d'`engine.ts` au branchement de la 2ᵉ CLI (gemini) — la règle 9
 * interdit d'en copier une seconde : chaque CLI n'apporte que ses ARGS et son
 * INTERPRÉTEUR d'événements, le squelette est ici et nulle part ailleurs.
 *
 * FAIL-CLOSED : une CLI absente, non authentifiée ou qui meurt REJETTE. On ne rend
 * jamais un flux vide silencieux, qui se lirait comme « le modèle n'a rien répondu ».
 */
import { spawn } from "node:child_process";
import type { StreamDone, StreamFinish, TokenUsage } from "@openmasq/llm";
import { minimalChildEnv } from "../childEnv";
import { NdjsonLineBuffer } from "./claudeStream";

/** Ce qu'un interpréteur fait remonter. Tout le reste du flux est ignoré volontairement. */
export type CliAction =
  | { kind: "session"; id: string }
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  | { kind: "rateLimit"; status: string; resetsAt?: number; windowType?: string }
  | { kind: "done"; usage?: TokenUsage; finish: StreamFinish }
  | { kind: "error"; message: string };

function raise(err: Error): never {
  throw err;
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

export interface CliProcessOptions {
  binPath: string;
  args: string[];
  /** Répertoire de travail DÉDIÉ et neutre — jamais un dossier de l'utilisateur. */
  cwd: string;
  /** Variables AJOUTÉES à l'environnement minimal (ex. `GEMINI_CLI_HOME` neutre). */
  extraEnv?: Record<string, string>;
  /** Événement JSON (une ligne NDJSON) → action, ou null (ignoré). `sawDelta` permet à
   *  un interpréteur de traiter différemment un récapitulatif final (piège claude n°3). */
  interpret: (event: unknown, sawDelta: boolean) => CliAction | null;
  signal?: AbortSignal;
  onReasoning?: (delta: string) => void;
  /** Quota d'ABONNEMENT atteint — à afficher tel quel, jamais comme une erreur technique. */
  onRateLimit?: (info: { status: string; resetsAt?: number; windowType?: string }) => void;
}

/**
 * Un tour. Rend les deltas de texte au fil de l'eau et retourne l'usage + la cause de
 * fin, exactement comme `streamAnthropic` dans `@openmasq/llm` — pour que le branchement
 * dans la couche provider soit un simple aiguillage.
 */
export async function* streamCliProcess(
  opts: CliProcessOptions,
): AsyncGenerator<string, StreamDone> {
  const child = spawn(opts.binPath, opts.args, {
    cwd: opts.cwd,
    env: { ...minimalChildEnv(), ...(opts.extraEnv ?? {}) },
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
    const action = opts.interpret(event, sawDelta);
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
        done = { usage: action.usage, finish: action.finish };
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

  // Un Stop (abort) fait mourir l'enfant en SIGTERM ; certaines CLI émettent alors un
  // dernier événement d'erreur (« context canceled » chez agy, mesuré) AVANT de
  // fermer. Ce n'est pas une panne : l'utilisateur a annulé — on rend `cut`.
  const abortedCut = (): StreamDone | null =>
    opts.signal?.aborted ? { finish: "cut" } : null;

  try {
    while (true) {
      while (pending.length) yield pending.shift() as string;
      if (failure) return abortedCut() ?? raise(failure);
      if (finished) break;
      await new Promise<void>((r) => {
        resolveTick = r;
      });
    }

    const code = await exited;
    while (pending.length) yield pending.shift() as string;
    if (failure) return abortedCut() ?? raise(failure);

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
