/**
 * The folder/file a question is ABOUT — staged when the user clicks « Demander » on a
 * granted local folder or a connected-storage entry (Drive/OneDrive/Dropbox), and
 * persisted on the user message (`Message.askTarget`) exactly like a compétence tag.
 * Nothing is attached: the model reads the target with the connector's tools; this tag
 * is what tells it (and the user) WHAT the question refers to, instead of a bare name
 * it can only guess at ("patrons" read as a concept, not as the clicked Dropbox folder).
 *
 * Own file for rule 1 (`message.ts` sits at the 300-LOC cap), like `conversation.ts`.
 */
export interface AskTarget {
  kind: "folder" | "file";
  name: string;
  /** Absolute path of a LOCAL granted folder — absent for a cloud target. */
  path?: string;
  /** Connector display name ("Dropbox") for a CLOUD target — absent for a local one. */
  source?: string;
  /**
   * SNAPSHOT of the context line that rode the model payload (model-only, like
   * `competence.prompt`). Derived solely from the fields above — no data the kept
   * `name`/`path` don't already hold (the `attachments` name precedent), so unlike
   * `competence.prompt` it stays in the plaintext localStorage copy.
   */
  prompt?: string;
}
