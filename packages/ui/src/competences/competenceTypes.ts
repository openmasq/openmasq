/** The COMPÉTENCES types — with the feature (same rule as
 *  `memory/memoryTypes.ts`), re-exported by `types.ts`, the single import surface. */

/** The categories a Compétence can be filed under. The id is what persists, so
 *  it must stay stable; the label/tone/glyph are presentation. */
export type CompetenceCategoryId =
  | "redaction"
  | "analyse"
  | "code"
  | "juridique"
  | "support"
  /** What the app used to call a "workflow": a compétence that drives connectors. */
  | "routine";

/**
 * One COMPÉTENCE — a reusable prompt the user writes once and uses in a
 * conversation on demand ("utiliser" = stage it; its `prompt` joins the model
 * payload at send). User-authored content, NOT app config: see
 * `Settings.competences` for why it nonetheless rides the settings blob.
 *
 * ⚠️ **There is now only ONE object.** "Workflows" were a second one, one field
 * away, with two twin screens. The only BEHAVIOUR difference was `servers`, which became
 * an optional field here, and the rule that replaces the boundary: **a compétence that
 * names connectors uses them** (`competences/launch.ts`). Without `servers`, nothing
 * changes from the old behaviour.
 */
export interface Competence {
  id: string;
  /** Short display name, e.g. "Réponse e-mail pro". */
  name: string;
  /** One-line description of what it does. */
  desc?: string;
  /** The prompt body that joins the model payload; `{accolades}` mark values to fill. */
  prompt: string;
  cat: CompetenceCategoryId;
  /** Catalog connector ids (`@openmasq/catalog` MCP registry) it drives. Absent or
   *  empty = a plain prompt, with no effect on which tools the turn is offered. */
  servers?: string[];
  /** Pinned → also listed in the sidebar for one-click use. */
  pinned?: boolean;
  /** How many times it has been used (ordering + a usage hint). */
  uses?: number;
  /** Creation time (ms epoch), for stable ordering. */
  createdAt: number;
}
