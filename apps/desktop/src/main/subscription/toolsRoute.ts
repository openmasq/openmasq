/**
 * L'AIGUILLAGE du tour outillé, tenu hors de `main/index.ts` (règle 1 : ce fichier est
 * un plafond gelé, et un branchement de plus l'aurait creusé) et rangé avec la famille
 * qu'il sert (règle 2).
 *
 * Une seule question : ce fournisseur est-il servi par une CLI d'abonnement ? Si oui,
 * le tour outillé lui répond avec le contrat de `completeWithTools` ; sinon `null`, et
 * l'appelant reprend son chemin normal (clé + egress). Écrit comme un aiguillage
 * NOMMANT ce qu'il sert : un fournisseur inconnu retombe sur `null`, jamais sur une
 * tentative de spawn.
 */
import type { ChatMessage, CompleteToolsResult, ToolDef } from "@openmasq/llm";
import { subscriptionTurnEnv } from "./desktop";
import { completeSubscriptionTools } from "./toolsTurn";

/** Les fournisseurs dont le tour OUTILLÉ passe par une CLI locale. `codex-cli` n'y est
 *  pas : son moteur ne porte pas encore de pont d'outils (texte seul, `noTools`). */
const TOOLED_CLI_PROVIDERS = new Set(["claude-cli"]);

export interface SubscriptionToolsRequest {
  provider: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
}

export interface SubscriptionToolsHooks {
  signal: AbortSignal;
  /** Texte de l'assistant au fil de l'eau (chemin streamé). */
  onDelta?: (text: string) => void;
  onReasoning?: (delta: string) => void;
}

/**
 * Le tour outillé de l'abonnement, ou `null` si ce fournisseur n'en est pas un.
 * La boucle agentique appelante ne voit aucune différence avec un modèle à clé : le
 * pont MCP CAPTURE l'appel d'outil (`toolsBridge.ts`), il ne l'exécute jamais — donc
 * le coffre et la porte d'écriture restent ceux de l'app.
 */
export function subscriptionToolsRoute(
  req: SubscriptionToolsRequest,
  hooks: SubscriptionToolsHooks,
): Promise<CompleteToolsResult> | null {
  if (!TOOLED_CLI_PROVIDERS.has(req.provider)) return null;
  return completeSubscriptionTools(subscriptionTurnEnv("claude"), {
    messages: req.messages,
    tools: req.tools ?? [],
    modelId: req.model,
    signal: hooks.signal,
    onDelta: hooks.onDelta,
    onReasoning: hooks.onReasoning,
  });
}
