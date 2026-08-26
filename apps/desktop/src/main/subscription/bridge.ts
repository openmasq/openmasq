/**
 * Le pont entre le contrat `streamChat` de OpenMasq (SANS état : tout l'historique à
 * chaque tour) et la CLI (AVEC état : sa propre session).
 *
 * ## Pourquoi on aplatit, et pourquoi ce n'est pas un pis-aller
 *
 * Trois voies existent; deux sont des impasses, mesurées :
 *
 * 1. `--input-format stream-json` — écarté. Relevé sur la CLI 2.1.241 : chaque message
 *    `user` du flux est exécuté comme un TOUR À PART (deux messages ⇒ deux `result`,
 *    deux réponses). C'est une conversation en direct, pas un préchargement
 *    d'historique : lui réinjecter N tours passés les REJOUERAIT et les refacturerait.
 *
 * 2. `--resume <session>` — la voie « native », et la moins chère : on n'enverrait que
 *    le dernier message, la CLI gardant le contexte. Écartée pour l'instant parce que
 *    `StreamChatOptions` ne porte AUCUN identifiant de conversation, et surtout parce
 *    que la session de la CLI DIVERGE dès que l'utilisateur édite, régénère ou supprime
 *    un tour — trois gestes ordinaires dans un chat. OpenMasq cesserait d'être la source
 *    de vérité de sa propre conversation. À reprendre si on plombe un id de
 *    conversation (voir la note en bas de `CLAUDE.md`).
 *
 * 3. Aplatir l'historique en un prompt, session neuve à chaque tour — retenu. C'est
 *    EXACTEMENT ce que font déjà tous les autres providers de OpenMasq (`messages` complet
 *    à chaque appel) : même coût, même sémantique, aucune divergence possible, et zéro
 *    changement de contrat.
 */
import type { ChatMessage } from "@openmasq/llm";

/** Étiquettes de rôle du transcript. Explicites : le modèle lit un dialogue, pas un bloc. */
const ROLE_LABEL: Record<string, string> = {
  user: "Utilisateur",
  assistant: "Assistant",
  tool: "Résultat d'outil",
};

export interface FlattenedTurn {
  /** Les messages `system`, joints — passés en `--system-prompt`. */
  system?: string;
  /** Le reste, en transcript. Vide = rien à envoyer (l'appelant doit refuser le tour). */
  prompt: string;
}

/**
 * `ChatMessage[]` → un tour CLI.
 *
 * Cas particulier volontaire : une conversation d'UN SEUL message utilisateur est
 * envoyée NUE, sans étiquette de rôle — c'est le cas le plus fréquent (premier message),
 * et le décorer d'un « Utilisateur : » ferait dériver le ton de la réponse pour rien.
 */
export function flattenForCli(messages: ChatMessage[]): FlattenedTurn {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const turns = messages.filter((m) => m.role !== "system");

  if (turns.length === 1 && turns[0].role === "user") {
    return { system: system || undefined, prompt: turns[0].content.trim() };
  }

  const prompt = turns
    .map((m) => {
      const label = ROLE_LABEL[m.role] ?? m.role;
      return `${label} :\n${m.content.trim()}`;
    })
    .filter((block) => !block.endsWith(":\n"))
    .join("\n\n");

  return { system: system || undefined, prompt: prompt.trim() };
}

/**
 * Les pièces jointes ne passent pas par ce chemin : la CLI headless prend du texte, pas
 * des blocs image. Le signaler TÔT et clairement vaut mieux que de les laisser tomber en
 * silence — l'utilisateur verrait le modèle « ignorer » sa capture sans comprendre.
 */
export function hasUnsupportedAttachments(messages: ChatMessage[]): boolean {
  return messages.some((m) => (m.attachments?.length ?? 0) > 0);
}
