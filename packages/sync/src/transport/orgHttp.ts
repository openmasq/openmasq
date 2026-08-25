/**
 * REST transport for the ORG-SHARE channel (`orgScope/`), against
 * `@openmasq/backend`. Same coupling contract as `http.ts` (a `getToken`, an
 * optional `fetch`), same device identification (`deviceAuth.ts` — the backend
 * additionally gates every route on the caller's membership + the share
 * matrix). A null token short-circuits, so a signed-out client no-ops.
 */
import type { HttpTransportOptions } from "./http";
import { createDeviceAuth } from "./deviceAuth";
import type {
  MemberKeyEnvelope,
  OrgEncryptedRecord,
  OrgMemberPublicKey,
  OrgNotification,
  OrgScopeKeys,
  OrgScopeTransport,
  OrgServerRecord,
  OrgShareInfo,
} from "../orgScope/orgTypes";

export function orgHttpTransport(opts: HttpTransportOptions): OrgScopeTransport {
  const root = opts.baseUrl.replace(/\/+$/, "") + "/api-features";
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const enc = encodeURIComponent;

  async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
    const token = await opts.getToken();
    if (!token) return null;
    const res = await doFetch(root + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = new Error(`[sync] ${init?.method ?? "GET"} ${path} → ${res.status}`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }

  const deviceAuth = createDeviceAuth({
    getDeviceId: opts.getDeviceId,
    getDeviceSecret: opts.getDeviceSecret,
    mint: (deviceId, secret) =>
      call<{ token: string; expiresIn: number }>(`/sync/devices/${enc(deviceId)}/token`, {
        method: "POST",
        body: JSON.stringify({ secret }),
      }),
  });
  const dev = () => deviceAuth.deviceHeaders();
  const orgBase = (orgUuid: string) => `/organizations/${enc(orgUuid)}/sync`;
  const shareBase = (orgUuid: string, shareUuid: string) =>
    `${orgBase(orgUuid)}/shares/${enc(shareUuid)}`;

  return {
    async getMyMemberKey(): Promise<MemberKeyEnvelope | null> {
      const out = await call<{ key: MemberKeyEnvelope | null }>("/sync/member-key", {
        headers: await dev(),
      });
      return out?.key ?? null;
    },

    async putMemberKey(envelope, replace): Promise<MemberKeyEnvelope> {
      const out = await call<{ key: MemberKeyEnvelope }>("/sync/member-key", {
        method: "PUT",
        body: JSON.stringify({ key: envelope, replace: !!replace }),
        headers: await dev(),
      });
      return out?.key ?? envelope;
    },

    async listOrgMemberKeys(orgUuid): Promise<OrgMemberPublicKey[]> {
      const out = await call<{ members: OrgMemberPublicKey[] }>(
        `${orgBase(orgUuid)}/member-keys`,
        { headers: await dev() },
      );
      return out?.members ?? [];
    },

    async listShares(orgUuid): Promise<OrgShareInfo[]> {
      const out = await call<{ shares: OrgShareInfo[] }>(`${orgBase(orgUuid)}/shares`, {
        headers: await dev(),
      });
      return out?.shares ?? [];
    },

    async proposeShare(orgUuid, proposal): Promise<OrgShareInfo | null> {
      const out = await call<{ share: OrgShareInfo }>(`${orgBase(orgUuid)}/shares`, {
        method: "POST",
        body: JSON.stringify(proposal),
        headers: await dev(),
      });
      return out?.share ?? null;
    },

    async decideShare(orgUuid, shareUuid, approve): Promise<OrgShareInfo | null> {
      const out = await call<{ share: OrgShareInfo }>(
        `${shareBase(orgUuid, shareUuid)}/decision`,
        { method: "POST", body: JSON.stringify({ approve }), headers: await dev() },
      );
      return out?.share ?? null;
    },

    async revokeShare(orgUuid, shareUuid): Promise<void> {
      await call(`${shareBase(orgUuid, shareUuid)}/revoke`, {
        method: "POST",
        body: JSON.stringify({}),
        headers: await dev(),
      });
    },

    async getShareKeys(orgUuid, shareUuid): Promise<OrgScopeKeys> {
      const out = await call<OrgScopeKeys>(`${shareBase(orgUuid, shareUuid)}/keys`, {
        headers: await dev(),
      });
      return out ?? { envelopes: [], currentVersion: 0, holders: [] };
    },

    async putShareKeys(orgUuid, shareUuid, keyVersion, envelopes): Promise<void> {
      await call(`${shareBase(orgUuid, shareUuid)}/keys`, {
        method: "PUT",
        body: JSON.stringify({ keyVersion, envelopes }),
        headers: await dev(),
      });
    },

    async getShareRecords(
      orgUuid,
      shareUuid,
      since: number,
    ): Promise<{ records: OrgServerRecord[]; seq: number }> {
      const out = await call<{ records: OrgServerRecord[]; seq: number }>(
        `${shareBase(orgUuid, shareUuid)}/records?since=${since}`,
        { headers: await dev() },
      );
      return out ?? { records: [], seq: since };
    },

    async putShareRecords(orgUuid, shareUuid, records: OrgEncryptedRecord[]): Promise<number> {
      const out = await call<{ seq: number }>(`${shareBase(orgUuid, shareUuid)}/records`, {
        method: "PUT",
        body: JSON.stringify({ records }),
        headers: await dev(),
      });
      return out?.seq ?? 0;
    },

    async listNotifications(orgUuid): Promise<OrgNotification[]> {
      const out = await call<{ notifications: OrgNotification[] }>(
        `${orgBase(orgUuid)}/notifications`,
        { headers: await dev() },
      );
      return out?.notifications ?? [];
    },

    async readNotification(orgUuid, id): Promise<void> {
      await call(`${orgBase(orgUuid)}/notifications/${id}/read`, {
        method: "POST",
        body: JSON.stringify({}),
        headers: await dev(),
      });
    },
  };
}
