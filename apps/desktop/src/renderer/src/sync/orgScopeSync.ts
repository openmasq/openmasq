/**
 * Desktop orchestration of the ORG-SHARE channel — coffre + compétences
 * partagés à l'org / une équipe / une personne, E2E à l'audience, approbation
 * avant lecture. All decisions live in `@openmasq/sync` (`orgScope/` — keys,
 * audiences, rotation) and in the BACKEND (the share matrix); this file only
 * builds records from app items, aggregates readable shares into the
 * `Settings.orgCoffre` / `orgCompetences` mirrors, and exposes the UI-shaped
 * `OrgSharesHost`. Best-effort throughout: signed out / no passphrase / no
 * org → silent no-op.
 */
import Debug from "debug";
import {
  absorbCoffreRecords,
  absorbUserdataRecords,
  createOrgScopeSync,
  emitCoffreRecords,
  emitUserdataRecords,
  emptyCoffreSyncState,
  emptyUserdataSyncState,
  orgHttpTransport,
  type OrgScopeSync,
  type OrgShareInfo,
  type SyncedCoffreTerm,
  type SyncedCompetence,
  type SyncRecord,
} from "@openmasq/sync";
import type {
  CoffreTerm,
  Competence,
  OrgSharesHost,
  OrgShareView,
} from "@openmasq/ui";
import { getSyncPassphrase } from "./passphrase";
import { reportSyncError, syncDeviceId, transportOptions } from "./client";

const debug = Debug("openmasq:sync");

// ONE transport instance, shared by the client and the roster read below.
let transportCached: ReturnType<typeof orgHttpTransport> | null | undefined;
function orgTransport(): ReturnType<typeof orgHttpTransport> | null {
  if (transportCached !== undefined) return transportCached;
  const opts = transportOptions();
  transportCached = opts ? orgHttpTransport(opts) : null;
  return transportCached;
}

let cached: OrgScopeSync | null | undefined;
export function orgSync(): OrgScopeSync | null {
  if (cached !== undefined) return cached;
  const t = orgTransport();
  cached = t
    ? createOrgScopeSync({
        transport: t,
        getPassphrase: getSyncPassphrase,
        onError: reportSyncError,
      })
    : null;
  debug("org-share sync client %s", cached ? "created" : "disabled");
  return cached;
}

/** À appeler quand la phrase secrète change (mêmes moments que
 *  `recordSync().resetKeys()`) — sans quoi un partage scellé le reste. */
export function resetOrgKeys(): void {
  cached?.resetKeys();
}

// The hook publishes the CURRENT org + its re-pull here so the Host surface
// (which the UI calls without an org id) always acts on the signed-in org.
let currentOrgUuid: string | null = null;
let refreshMirrors: (() => Promise<void>) | null = null;
export function setOrgShareContext(orgUuid: string | null, refresh: (() => Promise<void>) | null): void {
  currentOrgUuid = orgUuid;
  refreshMirrors = refresh;
}

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

/** Records for a coffre-share SNAPSHOT: the pure emit machinery over a fresh
 *  ledger (one allow-listed record per term — rule 9, no second serializer). */
const coffreRecords = (terms: SyncedCoffreTerm[]): SyncRecord[] =>
  emitCoffreRecords(terms, emptyCoffreSyncState("share"), syncDeviceId()).records;
const competenceRecords = (competences: SyncedCompetence[]): SyncRecord[] =>
  emitUserdataRecords(
    { competences, workflows: [], memoryCards: [] },
    emptyUserdataSyncState("share"),
    syncDeviceId(),
  ).records;

/** Pull every READABLE share and aggregate by scope (deduped by item id —
 *  the same item shared twice lands once). Authors also drive their shares'
 *  recipient sets (admit newly-keyed audience members, rotate on exits). */
export function pullOrgShares(
  orgUuid: string,
): Promise<{ terms: CoffreTerm[]; competences: Competence[] } | null> {
  return serial(async () => {
    const s = orgSync();
    if (!s) return null;
    if (!(await s.ensureMemberKey())) return null;
    const shares = await s.listShares(orgUuid);
    for (const share of shares) {
      if (share.canWrite && share.status !== "refused" && share.status !== "revoked") {
        const r = await s.syncShareMembership(orgUuid, share);
        if (r.admitted || r.rotated)
          debug("share %s: admitted=%d rotated=%s", share.shareUuid.slice(0, 8), r.admitted, r.rotated);
      }
    }
    const terms = new Map<string, CoffreTerm>();
    const competences = new Map<string, Competence>();
    for (const share of shares) {
      if (!share.canRead || share.status !== "approved") continue;
      // A PERSON share never mirrors: accepting it ADOPTS the items into the
      // recipient's PERSONAL list (ShareInbox → pullShareItems) — « vous
      // gardez votre copie » goes both ways (design).
      if (share.audience.kind === "user") continue;
      const { records } = await s.pullShare(orgUuid, share, 0);
      if (!records.length) continue;
      // The device-local `orgScope` tag is what badges the row (Équipe/Orga).
      const orgScope = share.audience.kind === "team" ? "team" : "org";
      if (share.scope === "coffre") {
        const out = absorbCoffreRecords([], records, emptyCoffreSyncState("mirror"));
        for (const t of out.terms) terms.set(t.id, { ...(t as CoffreTerm), orgScope } as CoffreTerm);
      } else {
        const out = absorbUserdataRecords(
          { competences: [], workflows: [], memoryCards: [] },
          records,
          emptyUserdataSyncState("mirror"),
        );
        for (const c of out.snapshot.competences)
          competences.set(c.id, { ...(c as Competence), orgScope } as Competence);
      }
    }
    debug("org shares: %d visible, %d terms, %d compétences", shares.length, terms.size, competences.size);
    return { terms: [...terms.values()], competences: [...competences.values()] };
  });
}

const toView = (s: OrgShareInfo): OrgShareView => s as unknown as OrgShareView;

/** The UI-shaped Host surface. Every call is best-effort and re-gated by the
 *  backend; `refresh()` re-pulls the mirrors through the hook's pipeline. */
export const orgSharesHost: OrgSharesHost = {
  async list() {
    const s = orgSync();
    if (!s || !currentOrgUuid) return [];
    return (await s.listShares(currentOrgUuid)).map(toView);
  },
  async audience() {
    // The roster IS the wrap-target list — one source (`member-keys`), so the
    // picker and the crypto cannot disagree.
    const t = orgTransport();
    if (!t || !currentOrgUuid) return { teams: [], members: [] };
    const members = await t.listOrgMemberKeys(currentOrgUuid).catch(() => []);
    const teams = new Map<string, string>();
    for (const m of members) if (m.teamUuid) teams.set(m.teamUuid, m.teamName ?? "Équipe");
    return {
      teams: [...teams.entries()].map(([uuid, name]) => ({ uuid, name })),
      members: members.map((m) => ({
        uuid: m.memberUuid,
        name: m.name ?? null,
        teamUuid: m.teamUuid ?? null,
        role: m.role,
        me: m.me,
      })),
      myTeamUuid: members.find((m) => m.me)?.teamUuid ?? null,
    };
  },
  async proposeCoffre({ audience, label, terms }) {
    const s = orgSync();
    if (!s || !currentOrgUuid) return null;
    const share = await s.proposeShare(
      currentOrgUuid,
      { scope: "coffre", audience, label },
      coffreRecords(terms as SyncedCoffreTerm[]),
    );
    return share ? toView(share) : null;
  },
  async proposeCompetences({ audience, label, competences }) {
    const s = orgSync();
    if (!s || !currentOrgUuid) return null;
    const share = await s.proposeShare(
      currentOrgUuid,
      { scope: "userdata", audience, label },
      competenceRecords(competences as SyncedCompetence[]),
    );
    return share ? toView(share) : null;
  },
  async decide(shareUuid, approve) {
    const s = orgSync();
    if (!s || !currentOrgUuid) return null;
    const share = await s.decideShare(currentOrgUuid, shareUuid, approve);
    await refreshMirrors?.();
    return share ? toView(share) : null;
  },
  async revoke(shareUuid) {
    const s = orgSync();
    if (!s || !currentOrgUuid) return false;
    const ok = await s.revokeShare(currentOrgUuid, shareUuid);
    await refreshMirrors?.();
    return ok;
  },
  async notifications() {
    const s = orgSync();
    if (!s || !currentOrgUuid) return [];
    const rows = await s.listNotifications(currentOrgUuid);
    return rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      payload: n.payload,
      shareUuid: n.shareUuid,
      readAt: n.readAt,
    }));
  },
  async pullShareItems(shareUuid) {
    const none = { terms: [], competences: [] };
    const s = orgSync();
    if (!s || !currentOrgUuid) return none;
    const share = (await s.listShares(currentOrgUuid)).find((x) => x.shareUuid === shareUuid);
    if (!share) return none;
    const { records } = await s.pullShare(currentOrgUuid, share, 0);
    if (!records.length) return none;
    if (share.scope === "coffre") {
      const out = absorbCoffreRecords([], records, emptyCoffreSyncState("adopt"));
      return { terms: out.terms as CoffreTerm[], competences: [] };
    }
    const out = absorbUserdataRecords(
      { competences: [], workflows: [], memoryCards: [] },
      records,
      emptyUserdataSyncState("adopt"),
    );
    return { terms: [], competences: out.snapshot.competences as Competence[] };
  },
  async markRead(id) {
    const s = orgSync();
    if (!s || !currentOrgUuid) return;
    await s.readNotification(currentOrgUuid, id);
  },
  async refresh() {
    await refreshMirrors?.();
  },
};
