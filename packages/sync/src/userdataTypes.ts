/**
 * The USERDATA studio's allow-listed shapes + the Settings glue (split from
 * `userdata.ts` for the 300-LOC cap; the emit/absorb logic stays there). These
 * are the ONLY fields that ride a `@userdata` record — rebuilt field-by-field in
 * `userdata.ts`, never spread, so a device-local extra (`uses`, a future flag)
 * can't leak into a record.
 */

/** One compétence, as the sync sees it (allow-listed). */
export interface SyncedCompetence {
  id: string;
  name: string;
  desc?: string;
  prompt: string;
  cat: string;
  /** Présent sur la compétence LOCALE (une seule liste). Sur le FIL il décide du
   *  compartiment — `snapshotOfSettings` — et n'est jamais émis ici : `cleanCompetence`
   *  ne le connaît pas, une routine passe par `SyncedWorkflow`. */
  servers?: string[];
  pinned?: boolean;
  createdAt: number;
}

/**
 * Une compétence QUI PILOTE DES CONNECTEURS, telle qu'elle voyage. `servers` are catalog
 * connector IDS — display hints, never credentials/URLs (same contract as the
 * integrations directory).
 *
 * ⚠️ **C'est un compartiment du FIL, plus une liste de l'app.** Les compétences et les
 * « workflows » ont fusionné côté produit ; l'enveloppe, elle, garde ses deux
 * compartiments, parce qu'elle est déjà en circulation : un appareil resté sur une
 * version antérieure lit `wf:` et rien d'autre pour ses routines. On répartit donc à
 * l'émission (`servers` non vide ⇒ ce compartiment) et on refusionne à la réception —
 * les deux sens du même aller-retour, `userdataTypes.test.ts`. Le jour où plus aucun
 * appareil ancien ne tourne, ce compartiment se supprime d'un bloc.
 */
export interface SyncedWorkflow {
  id: string;
  name: string;
  desc?: string;
  prompt: string;
  servers: string[];
  /** La catégorie, pour un aller-retour entre appareils À JOUR. Un appareil ancien
   *  l'ignore et la perd en réémettant : la réception retombe alors sur « routine »,
   *  ce qui reste vrai — elle pilote bien des connecteurs. */
  cat?: string;
  pinned?: boolean;
  createdAt: number;
}

/** One mémoire card (allow-listed). `facts`/`entity` are REAL personal data —
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
  | { type: "competence"; item: SyncedCompetence }
  | { type: "workflow"; item: SyncedWorkflow }
  | { type: "memoryCard"; item: SyncedMemoryCard }
  | { type: "memoryProfile"; profile: string };

/** What a device syncs, in both directions. Callers may pass RICHER objects
 *  (extra local fields ride through an absorb untouched); emission re-builds
 *  the allow-listed subset only. */
export interface UserdataSnapshot {
  competences: SyncedCompetence[];
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
  competences?: SyncedCompetence[];
  /** LEGACY — le champ local d'avant la fusion, encore lu sur un blob ancien. `servers`
   *  y est facultatif, comme sur la compétence unique. */
  workflows?: SyncedCompetence[];
  memoire?: { profile?: string; cards: SyncedMemoryCard[] };
}

/**
 * ⚠️ L'app n'a plus qu'UNE liste ; le fil en a deux (voir `SyncedWorkflow`). On répartit
 * ici, sur le seul critère qui décide de tout ailleurs : `servers` non vide.
 *
 * Ce n'est pas de la cosmétique — `cleanCompetence` n'émet pas `servers`, donc une
 * routine passée par le compartiment des compétences arriverait sur l'autre appareil
 * SANS ses connecteurs, c'est-à-dire en ne faisant plus rien. La répartition est ce qui
 * lui garde son comportement.
 */
export const snapshotOfSettings = (s: UserdataSettingsLike): UserdataSnapshot => {
  const all = [...(s.competences ?? []), ...(s.workflows ?? [])];
  const seen = new Set<string>();
  const competences: SyncedCompetence[] = [];
  const workflows: SyncedWorkflow[] = [];
  for (const c of all) {
    if (!c?.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const servers = (c as SyncedWorkflow).servers ?? [];
    if (servers.length) workflows.push({ ...(c as SyncedWorkflow), servers });
    else competences.push(c as SyncedCompetence);
  }
  return {
    competences,
    workflows,
    memoryCards: s.memoire?.cards ?? [],
    memoryProfile: s.memoire?.profile,
  };
};

/** The Settings patch that applies a merged snapshot back (the caller spreads
 *  it over its Settings; extra local item fields already rode through absorb). */
/** Le chemin inverse : les deux compartiments du fil reviennent dans l'UNIQUE liste de
 *  l'app. `workflows` repart vide — le champ local n'est plus écrit (la reprise d'un blob
 *  ancien est `competences/migrate.ts`), et le laisser plein le ferait réapparaître. */
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
