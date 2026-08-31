/**
 * The prose the AGENTIC LOOP addresses to the model and whose OUTPUT is read by
 * l'utilisateur.
 *
 * ⚠️ It is the only model-facing prose that enters this catalogue, and the reason is
 * precise: the rest (`send/inboundScreen.ts`, `agent/`, `prompt/`) follows the
 * CONVERSATION's language, where translating it would be a contradiction — but here the
 * sentence produced is displayed in the CHROME, during the wait, next to labels that follow
 * the interface. Asking for a French sentence under an English interface produced a
 * French line in the middle of the English.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface AgentMessages {
  /** The instruction that summarises a tool call into one showable line. */
  toolIntentSystem: string;
}
