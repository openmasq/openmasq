/**
 * Le tour complet « conversation OpenMasq → CLI » : la composition de `bridge.ts`
 * (aplatir l'historique) et d'`engine.ts` (spawn + streaming), avec les refus
 * FAIL-CLOSED qui doivent précéder tout spawn.
 *
 * Session NEUVE à chaque tour (un UUID jeté) : c'est le choix documenté dans
 * `CLAUDE.md` — OpenMasq reste la source de vérité de sa conversation, la CLI ne
 * garde aucun état entre deux tours.
 */
import { randomUUID } from "node:crypto";
import type { ChatMessage, StreamDone } from "@openmasq/llm";
import { flattenForCli, hasUnsupportedAttachments } from "./bridge";
import { streamClaudeSubscription } from "./engine";
import { codexPrompt, streamCodexSubscription } from "./codexEngine";

export interface SubscriptionTurnEnv {
  /** Quelle CLI sert ce tour (aiguillé par `desktop.ts` depuis le fournisseur).
   *  ABSENT = `claude`, l'entrée historique — le tour texte comme le tour OUTILLÉ
   *  (`toolsTurn.ts`) retombent dessus. */
  cli?: "claude" | "codex";
  /** Le nom montré dans les refus (« Claude Code », « Codex »). Absent ⇒ Claude Code. */
  label?: string;
  /** Chemin absolu du binaire, déjà résolu (`resolveCli`). */
  binPath: string;
  /** Répertoire de travail DÉDIÉ et neutre — jamais un dossier de l'utilisateur. */
  cwd: string;
}

export interface SubscriptionTurnOptions {
  messages: ChatMessage[];
  /** L'id REGISTRE du modèle choisi (`claude-cli`, `claude-cli-sonnet`, …) — traduit en
   *  alias CLI par `cliModelAlias`. Absent/inconnu ⇒ le défaut de l'abonnement. */
  modelId?: string;
  signal?: AbortSignal;
  onReasoning?: (delta: string) => void;
}

/**
 * Id registre → alias `--model` de la CLI. `claude-cli` nu = PAS de drapeau (le défaut
 * de l'abonnement — le comportement historique, et ce que servent les conversations déjà
 * épinglées dessus) ; `claude-cli-<famille>` = l'alias de famille (`sonnet`/`opus`/
 * `haiku`), que la CLI résout vers le modèle COURANT de cette famille. Un id inattendu
 * rend `undefined` plutôt qu'un alias inventé — le défaut, jamais une erreur CLI.
 * ⚠️ Opus dépend de l'offre (absent du plan Pro) : la CLI refuse alors le tour et son
 * message remonte tel quel via `chat:error`.
 */
export function cliModelAlias(modelId: string | undefined): string | undefined {
  const alias = modelId?.startsWith("claude-cli-") ? modelId.slice("claude-cli-".length) : "";
  return ["sonnet", "opus", "haiku"].includes(alias) ? alias : undefined;
}

/**
 * Un tour de chat sur l'abonnement. Même forme que `streamChat` (deltas au fil de
 * l'eau, `StreamDone` en valeur de retour) pour que l'aiguillage de `chat:start`
 * soit un simple choix d'itérateur.
 *
 * Les refus lèvent AVANT le spawn, en français — le message remonte tel quel au
 * renderer via `chat:error` :
 * - pièces jointes : la CLI headless prend du texte, pas des blocs image. Les
 *   laisser tomber en silence ferait « ignorer » un document par le modèle.
 * - tour vide : ne jamais spawner pour rien.
 */
export async function* streamSubscriptionTurn(
  env: SubscriptionTurnEnv,
  opts: SubscriptionTurnOptions,
): AsyncGenerator<string, StreamDone> {
  if (hasUnsupportedAttachments(opts.messages)) {
    throw new Error(
      `Le modèle « ${env.label ?? "Claude Code"} » ne prend pas encore les pièces jointes — ` +
        "envoyez du texte, ou choisissez un modèle avec vision.",
    );
  }
  const { system, prompt } = flattenForCli(opts.messages);
  if (!prompt) throw new Error("Rien à envoyer : la conversation ne contient aucun message.");

  if (env.cli === "codex") {
    return yield* streamCodexSubscription({
      binPath: env.binPath,
      prompt: codexPrompt(system, prompt),
      cwd: env.cwd,
      signal: opts.signal,
    });
  }

  return yield* streamClaudeSubscription({
    binPath: env.binPath,
    prompt,
    system,
    model: cliModelAlias(opts.modelId),
    sessionId: randomUUID(),
    cwd: env.cwd,
    signal: opts.signal,
    onReasoning: opts.onReasoning,
  });
}
