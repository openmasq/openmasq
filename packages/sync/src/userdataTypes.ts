/**
 * The USERDATA studio's allow-listed shapes + the Settings glue (split from
 * `userdata.ts` for the 300-LOC cap; the emit/absorb logic stays there). These
 * are the ONLY fields that ride a `@userdata` record — rebuilt field-by-field in
 * `userdata.ts`, never spread, so a device-local extra (`uses`, a future flag)
 * can't leak into a record.
 */

/** One skill, as the sync sees it (allow-listed). */
export interface SyncedSkill {
  id: string;
  name: string;
  desc?: string;
  prompt: string;
  cat: string;
  /** Present on the LOCAL skill (a single list). On the WIRE it decides the
   *  compartment — `snapshotOfSettings` — and is never emitted here: `cleanCompetence`
   *  doesn't know it, a routine goes through `SyncedWorkflow`. */
  servers?: string[];
  pinned?: boolean;
  createdAt: number;
}

/**
 * A skill THAT DRIVES CONNECTORS, as it travels. `servers` are catalog
 * connector IDS — display hints, never credentials/URLs (same contract as the
 * integrations directory).
 *
 * ⚠️ **This is a WIRE compartment, no longer an app list.** Skills and
 * "workflows" merged on the product side; the envelope, though, keeps its two
 * compartments, because it's already in circulation: a device stuck on an
 * earlier version reads `wf:` and nothing else for its routines. So we split on
 * emission (`servers` non-empty ⇒ this compartment) and re-merge on reception —
 * both directions of the same round trip, `userdataTypes.test.ts`. The day no
 * old device is running anymore, this compartment gets removed in one block.
 */
export interface SyncedWorkflow {
  id: string;
  name: string;
  desc?: string;
  prompt: string;
  servers: string[];
  /** The category, for a round trip between UP-TO-DATE devices. An old device
   *  ignores it and loses it on re-emit: reception then falls back to "routine",
   *  which stays true — it does drive connectors. */
  cat?: string;
  pinned?: boolean;
  createdAt: number;
}

/** One memory card (allow-listed). `facts`/`entity` are REAL personal data —
 *  which is exactly why this scope is E2E-encrypted like a conversation. */
export interface SyncedMemoryCard {
  id: string;
  entity: string;
  aliases?: string[];
  cat: string;
  facts: string;
  source?: "auto";
  createdAt: number;
  updatedAt: number;
}

export type UserdataPayload =
  | { type: "competence"; item: SyncedSkill }
  | { type: "workflow"; item: SyncedWorkflow }
  | { type: "memoryCard"; item: SyncedMemoryCard }
  | { type: "memoryProfile"; profile: string };

/** What a device syncs, in both directions. Callers may pass RICHER objects
 *  (extra local fields ride through an absorb untouched); emission re-builds
 *  the allow-listed subset only. */
export interface UserdataSnapshot {
  competences: SyncedSkill[];
  workflows: SyncedWorkflow[];
  memoryCards: SyncedMemoryCard[];
  memoryProfile?: string;
}

/** Per-account ledger (persisted by the app; content-free beyond entity ids +
 *  signatures of already-synced allow-listed fields). */
export interface UserdataSyncState {
  accountId: string;
  lamport: number;
  /** Entity key → signature of what was last emitted/absorbed for it. */
  sigs: Record<string, string>;
}

export const emptyUserdataSyncState = (accountId: string): UserdataSyncState => ({
  accountId,
  lamport: 0,
  sigs: {},
});

/** The Settings-shaped view of the studio — STRUCTURAL, so each app's richer
 *  `Settings` satisfies it without importing UI types (single-source glue for
 *  the desktop and mobile hooks, rule 9). */
export interface UserdataSettingsLike {
  competences?: SyncedSkill[];
  /** LEGACY — the local field from before the merge, still read on an old blob. `servers`
   *  is optional there, like on the single skill. */
  workflows?: SyncedSkill[];
  memoire?: { profile?: string; cards: SyncedMemoryCard[] };
}

/**
 * ⚠️ The app now has only ONE list; the wire has two (see `SyncedWorkflow`). We split
 * here, on the single criterion that decides everything else: `servers` non-empty.
 *
 * This isn't cosmetic — `cleanCompetence` doesn't emit `servers`, so a
 * routine passed through the skills compartment would arrive on the other device
 * WITHOUT its connectors, meaning it would no longer do anything. The split is what
 * keeps its behavior.
 */
export const snapshotOfSettings = (s: UserdataSettingsLike): UserdataSnapshot => {
  const all = [...(s.competences ?? []), ...(s.workflows ?? [])];
  const seen = new Set<string>();
  const skills: SyncedSkill[] = [];
  const workflows: SyncedWorkflow[] = [];
  for (const c of all) {
    if (!c?.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const servers = (c as SyncedWorkflow).servers ?? [];
    if (servers.length) workflows.push({ ...(c as SyncedWorkflow), servers });
    else skills.push(c as SyncedSkill);
  }
  return {
    competences: skills,
    workflows,
    memoryCards: s.memoire?.cards ?? [],
    memoryProfile: s.memoire?.profile,
  };
};

/** The Settings patch that applies a merged snapshot back (the caller spreads
 *  it over its Settings; extra local item fields already rode through absorb). */
/** The reverse path: the wire's two compartments come back into the app's SINGLE
 *  list. `workflows` goes out empty — the local field is no longer written (recovering an
 *  old blob is `competences/migrate.ts`), and leaving it filled would make it reappear. */
export const settingsPatchOf = (snap: UserdataSnapshot): Required<UserdataSettingsLike> => ({
  competences: [
    ...snap.competences,
    ...snap.workflows.map((w) => ({ ...w, cat: w.cat ?? "routine" })),
  ],
  workflows: [],
  memoire: {
    ...(snap.memoryProfile ? { profile: snap.memoryProfile } : {}),
    cards: snap.memoryCards,
  },
});
