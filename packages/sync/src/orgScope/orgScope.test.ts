/**
 * ORG-SHARE channel — the properties that make it safe to share E2E data with
 * an AUDIENCE (org / team / person) behind an approval:
 *  • the member private key opens only under ITS passphrase;
 *  • a share DEK envelope opens only in its exact (org, scope, SHARE, version)
 *    slot and only under the member it was wrapped to;
 *  • the audience filter is exact (author always in; team = that team;
 *    person = the target) — someone OUTSIDE the audience holds no envelope
 *    and decrypts nothing, whatever the server serves;
 *  • rotation locks an evictee out of every later version;
 *  • nothing stored on the fake server ever contains a plaintext term.
 * The server-side matrix (approval, RBAC × device) is pinned backend-side
 * (`orgScopeGate.test.ts` + e2e scenario 8).
 */
import { describe, expect, it } from "vitest";
import type { SyncRecord } from "../types";
import { audienceMembers, createOrgScopeSync } from "./orgClient";
import {
  createMemberKey,
  mintOrgDek,
  openMemberKey,
  openOrgDek,
  rewrapMemberKey,
  wrapOrgDek,
} from "./orgCrypto";
import {
  ORG_COFFRE_SCOPE,
  type MemberKeyEnvelope,
  type OrgKeyEnvelope,
  type OrgScopeTransport,
  type OrgServerRecord,
  type OrgShareInfo,
} from "./orgTypes";

const ORG = "11111111-1111-1111-1111-111111111111";
const TEAM = "22222222-2222-2222-2222-222222222222";

describe("org member key", () => {
  it("round-trips under its passphrase and refuses another", async () => {
    const { envelope } = await createMemberKey("phrase-A");
    await expect(openMemberKey(envelope, "phrase-A")).resolves.toBeDefined();
    await expect(openMemberKey(envelope, "phrase-B")).rejects.toThrow();
  });

  it("a passphrase re-wrap keeps the SAME keypair (old envelopes stay valid)", async () => {
    const { envelope } = await createMemberKey("old-phrase");
    const raw = mintOrgDek();
    const wrapped = await wrapOrgDek(raw, envelope.publicJwk, ORG, ORG_COFFRE_SCOPE, "share-1", 1);
    const next = await rewrapMemberKey(envelope, "old-phrase", "new-phrase");
    expect(next.publicJwk).toBe(envelope.publicJwk);
    await expect(openMemberKey(next, "old-phrase")).rejects.toThrow();
    const priv = await openMemberKey(next, "new-phrase");
    const opened = await openOrgDek(wrapped, priv, ORG, ORG_COFFRE_SCOPE, "share-1");
    expect([...opened.raw]).toEqual([...raw]);
  });
});

describe("share DEK envelope — slot binding", () => {
  it("opens only in its exact (org, scope, share, version) slot, only for its member", async () => {
    const alice = await createMemberKey("pass-alice");
    const bob = await createMemberKey("pass-bob");
    const alicePriv = await openMemberKey(alice.envelope, "pass-alice");
    const bobPriv = await openMemberKey(bob.envelope, "pass-bob");

    const raw = mintOrgDek();
    const env = await wrapOrgDek(raw, alice.envelope.publicJwk, ORG, ORG_COFFRE_SCOPE, "share-A", 1);
    const ok = await openOrgDek(env, alicePriv, ORG, ORG_COFFRE_SCOPE, "share-A");
    expect([...ok.raw]).toEqual([...raw]);

    await expect(openOrgDek(env, bobPriv, ORG, ORG_COFFRE_SCOPE, "share-A")).rejects.toThrow();
    // Another SHARE — the server can't replay an envelope across shares.
    await expect(openOrgDek(env, alicePriv, ORG, ORG_COFFRE_SCOPE, "share-B")).rejects.toThrow();
    await expect(
      openOrgDek({ ...env, keyVersion: 2 }, alicePriv, ORG, ORG_COFFRE_SCOPE, "share-A"),
    ).rejects.toThrow();
  });
});

describe("audienceMembers — the exact recipient circle", () => {
  const members = [
    { memberUuid: "author", publicJwk: "pk", teamUuid: TEAM },
    { memberUuid: "teammate", publicJwk: "pk", teamUuid: TEAM },
    { memberUuid: "other", publicJwk: "pk", teamUuid: null },
    { memberUuid: "target", publicJwk: "pk", teamUuid: null },
  ];
  const share = (audience: OrgShareInfo["audience"]) =>
    ({ audience, authorUuid: "author" }) as Pick<OrgShareInfo, "audience" | "authorUuid">;

  it("org = everyone; team = that team + the author; person = the target + the author", () => {
    expect(audienceMembers(share({ kind: "org" }), members).map((m) => m.memberUuid)).toEqual(
      ["author", "teammate", "other", "target"],
    );
    expect(
      audienceMembers(share({ kind: "team", teamUuid: TEAM }), members).map((m) => m.memberUuid),
    ).toEqual(["author", "teammate"]);
    expect(
      audienceMembers(share({ kind: "user", targetUuid: "target" }), members).map((m) => m.memberUuid),
    ).toEqual(["author", "target"]);
  });
});

// ---------------------------------------------------------------------------
// Fake server: one shared store, one transport view per account. It mirrors
// the READ gate loosely (author, or approved + in audience) so the flows read
// realistically — the authoritative gate is backend-tested.
// ---------------------------------------------------------------------------
interface FakeShare {
  info: Omit<OrgShareInfo, "mine" | "canDecide" | "canWrite" | "canRead" | "inAudience">;
  envelopes: Map<string, { memberUuid: string; envelope: OrgKeyEnvelope }[]>; // by version
  records: OrgServerRecord[];
  currentVersion: number;
}
interface FakeServer {
  memberKeys: Map<string, MemberKeyEnvelope>;
  members: Map<string, { role: string; teamUuid: string | null }>;
  shares: Map<string, FakeShare>;
  seq: number;
}
const newServer = (): FakeServer => ({ memberKeys: new Map(), members: new Map(), shares: new Map(), seq: 0 });

function view(server: FakeServer, me: string, share: FakeShare): OrgShareInfo {
  const a = share.info.audience;
  const m = server.members.get(me);
  const inAudience =
    a.kind === "org" || (a.kind === "team" ? m?.teamUuid === a.teamUuid : a.targetUuid === me);
  const isAdmin = m?.role === "owner" || m?.role === "admin";
  const mine = share.info.authorUuid === me;
  return {
    ...share.info,
    mine,
    inAudience,
    canDecide: share.info.status === "pending" && (a.kind === "user" ? a.targetUuid === me : isAdmin),
    canWrite: mine || isAdmin,
    canRead: mine || (share.info.status === "approved" && inAudience),
  };
}

function transportFor(server: FakeServer, me: string): OrgScopeTransport {
  const mustRead = (shareUuid: string): FakeShare => {
    const s = server.shares.get(shareUuid);
    if (!s) throw Object.assign(new Error("404"), { status: 404 });
    if (!view(server, me, s).canRead) throw Object.assign(new Error("403"), { status: 403 });
    return s;
  };
  return {
    async getMyMemberKey() {
      return server.memberKeys.get(me) ?? null;
    },
    async putMemberKey(envelope, replace) {
      const existing = server.memberKeys.get(me);
      if (existing && !replace) return existing;
      server.memberKeys.set(me, envelope);
      return envelope;
    },
    async listOrgMemberKeys() {
      return [...server.members.entries()].map(([memberUuid, m]) => ({
        memberUuid,
        publicJwk: server.memberKeys.get(memberUuid)?.publicJwk ?? null,
        role: m.role,
        teamUuid: m.teamUuid,
      }));
    },
    async listShares() {
      return [...server.shares.values()]
        .map((s) => view(server, me, s))
        .filter((s) => s.mine || s.canDecide || s.canRead || server.members.get(me)?.role !== "member");
    },
    async proposeShare(_org, proposal) {
      const role = server.members.get(me)?.role;
      const auto = proposal.audience.kind !== "user" && (role === "owner" || role === "admin");
      const shareUuid = `share-${server.shares.size + 1}`;
      const share: FakeShare = {
        info: {
          shareUuid,
          scope: proposal.scope,
          audience: proposal.audience,
          label: proposal.label,
          itemCount: proposal.itemCount ?? 0,
          status: auto ? "approved" : "pending",
          authorUuid: me,
        },
        envelopes: new Map(),
        records: [],
        currentVersion: 0,
      };
      server.shares.set(shareUuid, share);
      return view(server, me, share);
    },
    async decideShare(_org, shareUuid, approve) {
      const s = server.shares.get(shareUuid)!;
      if (!view(server, me, s).canDecide) throw Object.assign(new Error("403"), { status: 403 });
      s.info = { ...s.info, status: approve ? "approved" : "refused" };
      return view(server, me, s);
    },
    async revokeShare(_org, shareUuid) {
      const s = server.shares.get(shareUuid)!;
      s.info = { ...s.info, status: "revoked" };
    },
    async getShareKeys(_org, shareUuid) {
      const s = mustRead(shareUuid);
      const mine = [...s.envelopes.values()].flat().filter((e) => e.memberUuid === me).map((e) => e.envelope);
      const holders = (s.envelopes.get(String(s.currentVersion)) ?? []).map((e) => e.memberUuid);
      return { envelopes: mine, currentVersion: s.currentVersion, holders };
    },
    async putShareKeys(_org, shareUuid, keyVersion, envelopes) {
      const s = server.shares.get(shareUuid)!;
      const list = s.envelopes.get(String(keyVersion)) ?? [];
      for (const e of envelopes) if (!list.some((x) => x.memberUuid === e.memberUuid)) list.push(e);
      s.envelopes.set(String(keyVersion), list);
      if (keyVersion > s.currentVersion) s.currentVersion = keyVersion;
    },
    async getShareRecords(_org, shareUuid, since) {
      const s = mustRead(shareUuid);
      return { records: s.records.filter((r) => r.seq > since), seq: s.records.length };
    },
    async putShareRecords(_org, shareUuid, records) {
      const s = server.shares.get(shareUuid)!;
      for (const r of records) {
        if (r.keyVersion !== s.currentVersion)
          throw Object.assign(new Error("KEY_ROTATED"), { status: 409 });
        if (s.records.some((x) => x.recordId === r.recordId)) continue;
        s.records.push({ ...r, seq: s.records.length + 1 });
      }
      return s.records.length;
    },
    async listNotifications() {
      return [];
    },
    async readNotification() {},
  };
}

const client = (server: FakeServer, me: string, pass = `pass-${me}`) =>
  createOrgScopeSync({ transport: transportFor(server, me), getPassphrase: () => pass });

const rec = (id: string, value: string): SyncRecord => ({
  recordId: `r:${id}`,
  entityId: id,
  kind: "coffre",
  lamport: 1,
  deviceId: "d1",
  payload: { type: "coffreTerm", item: { id, value, token: "NAME", createdAt: 1 } },
});

describe("org share client — audience round-trips", () => {
  it("a member proposes to the ORG, an approval later the whole org reads; the server holds no plaintext", async () => {
    const server = newServer();
    server.members.set("alice", { role: "member", teamUuid: null });
    server.members.set("boss", { role: "owner", teamUuid: null });
    const alice = client(server, "alice");
    const boss = client(server, "boss");
    await alice.ensureMemberKey();
    await boss.ensureMemberKey();

    const secret = "Jean-Édouard de la Verdanière";
    const share = await alice.proposeShare(
      ORG,
      { scope: "coffre", audience: { kind: "org" }, label: "Termes projet" },
      [rec("t1", secret)],
    );
    expect(share?.status).toBe("pending"); // a plain member never auto-approves

    // Pending: the audience (boss) gets nothing yet — the fake read gate 403s
    // and the client degrades to empty, never a throw.
    const bossView = (await boss.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    expect((await boss.pullShare(ORG, bossView, 0)).records).toHaveLength(0);

    // Approved → the audience decrypts.
    await boss.decideShare(ORG, share!.shareUuid, true);
    const approved = (await boss.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    const pulled = await boss.pullShare(ORG, approved, 0);
    expect(pulled.records).toHaveLength(1);
    expect((pulled.records[0].payload as { item: { value: string } }).item.value).toBe(secret);

    const dump = JSON.stringify([...server.shares.values()].map((s) => ({ e: [...s.envelopes.values()], r: s.records })));
    expect(dump).not.toContain("Verdanière");
  });

  it("a TEAM share: the teammate decrypts, the outsider holds no envelope and gets nothing", async () => {
    const server = newServer();
    server.members.set("author", { role: "member", teamUuid: TEAM });
    server.members.set("teammate", { role: "member", teamUuid: TEAM });
    server.members.set("outsider", { role: "member", teamUuid: null });
    server.members.set("boss", { role: "owner", teamUuid: null });
    for (const who of ["author", "teammate", "outsider", "boss"]) await client(server, who).ensureMemberKey();

    const author = client(server, "author");
    const share = await author.proposeShare(
      ORG,
      { scope: "coffre", audience: { kind: "team", teamUuid: TEAM }, label: "Équipe" },
      [rec("t1", "valeur d'équipe")],
    );
    await client(server, "boss").decideShare(ORG, share!.shareUuid, true);

    const teammate = client(server, "teammate");
    const tView = (await teammate.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    expect((await teammate.pullShare(ORG, tView, 0)).records).toHaveLength(1);

    // The outsider is OUTSIDE the audience: no envelope was ever wrapped to
    // them, so even a leaky server would hand them undecryptable bytes.
    const versions = [...server.shares.get(share!.shareUuid)!.envelopes.values()].flat();
    expect(versions.map((e) => e.memberUuid)).not.toContain("outsider");
    // And the BOSS approved without being in the audience: no envelope either —
    // they approved the ACT, they cannot read (E2E).
    expect(versions.map((e) => e.memberUuid)).not.toContain("boss");
  });

  it("a PERSON share: the target consents then reads; an admin author still lands pending", async () => {
    const server = newServer();
    server.members.set("admin", { role: "admin", teamUuid: null });
    server.members.set("dest", { role: "member", teamUuid: null });
    for (const who of ["admin", "dest"]) await client(server, who).ensureMemberKey();

    const admin = client(server, "admin");
    const share = await admin.proposeShare(
      ORG,
      { scope: "userdata", audience: { kind: "user", targetUuid: "dest" }, label: "Pour toi" },
      [rec("c1", "compétence privée")],
    );
    // Consent belongs to the target — an ADMIN author never auto-approves.
    expect(share?.status).toBe("pending");

    const dest = client(server, "dest");
    const dView = (await dest.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    expect(dView.canDecide).toBe(true);
    await dest.decideShare(ORG, share!.shareUuid, true);
    const approved = (await dest.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    expect((await dest.pullShare(ORG, approved, 0)).records).toHaveLength(1);
  });

  it("an ADMIN proposing to the org auto-approves (they are the approver)", async () => {
    const server = newServer();
    server.members.set("boss", { role: "owner", teamUuid: null });
    const boss = client(server, "boss");
    await boss.ensureMemberKey();
    const share = await boss.proposeShare(
      ORG,
      { scope: "coffre", audience: { kind: "org" }, label: "Dictionnaire" },
      [rec("t1", "terme d'org")],
    );
    expect(share?.status).toBe("approved");
  });

  it("audience exit → rotation: the mover keeps v1, never v2", async () => {
    const server = newServer();
    server.members.set("author", { role: "member", teamUuid: TEAM });
    server.members.set("mover", { role: "member", teamUuid: TEAM });
    server.members.set("boss", { role: "owner", teamUuid: null });
    for (const who of ["author", "mover", "boss"]) await client(server, who).ensureMemberKey();

    const author = client(server, "author");
    const share = await author.proposeShare(
      ORG,
      { scope: "coffre", audience: { kind: "team", teamUuid: TEAM }, label: "Équipe" },
      [rec("t1", "avant départ")],
    );
    await client(server, "boss").decideShare(ORG, share!.shareUuid, true);

    // The mover leaves the team → the author's drive rotates to v2.
    server.members.set("mover", { role: "member", teamUuid: null });
    const myView = (await author.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    const drive = await author.syncShareMembership(ORG, myView);
    expect(drive.rotated).toBe(true);
    expect(server.shares.get(share!.shareUuid)!.currentVersion).toBe(2);
    await author.pushToShare(ORG, myView, [rec("t2", "après départ")]);

    // The mover's envelopes stop at v1: the v2 record is SKIPPED, never merged.
    const mover = client(server, "mover");
    const mView = { ...myView, canRead: true }; // even served, it cannot open v2
    const after = await mover.pullShare(ORG, mView, 1);
    expect(after.records).toHaveLength(0);
  });

  it("a push under a rotated-away version refreshes and retries once", async () => {
    const server = newServer();
    server.members.set("author", { role: "member", teamUuid: null });
    server.members.set("boss", { role: "owner", teamUuid: null });
    for (const who of ["author", "boss"]) await client(server, who).ensureMemberKey();
    const author = client(server, "author");
    const boss = client(server, "boss");
    const share = await author.proposeShare(
      ORG,
      { scope: "coffre", audience: { kind: "org" }, label: "L" },
      [rec("warm", "x")],
    );
    await boss.decideShare(ORG, share!.shareUuid, true);
    // The BOSS (admin writer) rotates while the author's DEK cache holds v1.
    const bossView = (await boss.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    server.members.set("ghost", { role: "member", teamUuid: null });
    await client(server, "ghost").ensureMemberKey();
    await boss.syncShareMembership(ORG, bossView); // admits ghost at v1
    server.members.delete("ghost");
    await boss.syncShareMembership(ORG, bossView); // rotation → v2
    expect(server.shares.get(share!.shareUuid)!.currentVersion).toBe(2);

    const myView = (await author.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    expect(await author.pushToShare(ORG, myView, [rec("t9", "y")])).toBe(1);
    expect(server.shares.get(share!.shareUuid)!.records.at(-1)?.keyVersion).toBe(2);
  });

  it("a wrong passphrase seals; resetKeys + the right one recovers", async () => {
    const server = newServer();
    server.members.set("alice", { role: "owner", teamUuid: null });
    const good = client(server, "alice", "pass-alice");
    await good.ensureMemberKey();
    const share = await good.proposeShare(
      ORG,
      { scope: "coffre", audience: { kind: "org" }, label: "L" },
      [rec("t1", "v")],
    );

    let pass = "WRONG";
    const errors: string[] = [];
    const dev2 = createOrgScopeSync({
      transport: transportFor(server, "alice"),
      getPassphrase: () => pass,
      onError: (scope) => errors.push(scope),
    });
    const sView = (await dev2.listShares(ORG)).find((s) => s.shareUuid === share!.shareUuid)!;
    expect((await dev2.pullShare(ORG, sView, 0)).records).toHaveLength(0);
    const before = errors.length;
    expect(before).toBeGreaterThan(0);
    expect((await dev2.pullShare(ORG, sView, 0)).records).toHaveLength(0);
    expect(errors.length).toBe(before); // sealed: no re-report

    pass = "pass-alice";
    dev2.resetKeys();
    expect((await dev2.pullShare(ORG, sView, 0)).records).toHaveLength(1);
  });
});
