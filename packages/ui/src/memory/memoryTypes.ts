/** The categories a memory card can be filed under (id persists; presentation in
 *  `memory/memory.ts`). */
export type MemoryCategory = "personne" | "organisation" | "projet" | "autre";

/**
 * One MEMORY CARD — durable facts about ONE entity (a person, an org, a project) the
 * user wants remembered ACROSS conversations. REAL user data: stored locally like the
 * Coffre, injected into a send only after passing the conversation's own redaction
 * (vault + per-conversation salt), never stored redacted (fakes aren't stable across
 * conversations any more).
 */
export interface MemoryCard {
  id: string;
  /** The entity's real name — also what the selection matches on. */
  entity: string;
  /** Other spellings that should hit this card ("Vaudel", "augustin.vaudel@…"). */
  aliases?: string[];
  cat: MemoryCategory;
  /** Freeform durable facts (bounded — the card COMPACTS over time, it never grows). */
  facts: string;
  /** What compaction REMOVED from `facts` — the sentence an attribute update replaced,
   *  or the one saturation evicted. A consolidation that overwrites its evidence in
   *  silence is the measured failure mode of agent memories: the history makes the update
   *  visible (panel) and restorable. Bounded (`MAX_FACT_LOG`), most recent first. Same
   *  regime at rest as `facts`. */
  factsLog?: { at: number; prev: string }[];
  /** Provenance: "auto" = written by the extraction (badge + easy cleanup); absent =
   *  user-authored. */
  source?: "auto";
  /** Last time the USER treated this card in the review flow — « Confirmer », or any
   *  edit made from the page's panel. A card is « à revoir » only while a machine
   *  write is NEWER than this (`freshCardIds`): reviewing empties the inbox, and a
   *  later silent-extraction touch re-enrolls the card. Never set by the extraction. */
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** The whole memory store: a global profile + per-entity cards. */
export interface MemoryData {
  /** Always-injected durable profile (bounded) — who the user is, standing context. */
  profile?: string;
  cards: MemoryCard[];
}
