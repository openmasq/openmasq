import { describe, expect, it } from "vitest";
import { decryptVault, encryptVault, generatePassphrase } from "./crypto";
import { isVaultSubset, mergeVaultPayloads } from "./merge";
import { deriveRedactionEvent, deriveRedactionEvents } from "./events";
import { createVaultSync } from "./vaultClient";
import type { OrgProfile, SyncTransport, VaultPayload } from "./types";

const payload = (over: Partial<VaultPayload> = {}): VaultPayload => ({
  redactionVault: { "Léa Savary": "Jean Rebour", "n1@x.com": "john@acme.com" },
  redactionKinds: { "Jean Rebour": "person", "john@acme.com": "email" },
  redactionTimes: { "Jean Rebour": 1000, "john@acme.com": 2000 },
  title: "Draft",
  modelId: "gpt-4o",
  updatedAt: 5000,
  ...over,
});

describe("crypto", () => {
  it("round-trips a vault through encrypt/decrypt with the same passphrase", async () => {
    const p = payload();
    const blob = await encryptVault(p, "correct horse battery staple");
    expect(blob.v).toBe(1);
    expect(blob.ciphertext).not.toContain("john@acme.com"); // opaque on the wire
    const back = await decryptVault(blob, "correct horse battery staple");
    expect(back).toEqual(p);
  });

  it("fails to decrypt with the wrong passphrase (GCM auth)", async () => {
    const blob = await encryptVault(payload(), "right-key");
    await expect(decryptVault(blob, "wrong-key")).rejects.toBeDefined();
  });

  it("generates distinct non-trivial passphrases", () => {
    const a = generatePassphrase();
    expect(a).toHaveLength(32);
    expect(a).not.toBe(generatePassphrase());
  });
});

describe("merge", () => {
  it("unions two vaults and keeps earliest first-seen times", () => {
    const a = payload({ updatedAt: 5000 });
    const b = payload({
      redactionVault: { "Marc Léo": "Marc Nozet" },
      redactionKinds: { "Marc Nozet": "person" },
      redactionTimes: { "Jean Rebour": 500, "Marc Nozet": 3000 },
      updatedAt: 9000,
    });
    const m = mergeVaultPayloads(a, b);
    expect(Object.keys(m.redactionVault)).toHaveLength(3);
    expect(m.redactionTimes!["Jean Rebour"]).toBe(500); // earliest wins
    expect(m.updatedAt).toBe(9000);
  });

  it("detects a subset to skip redundant pushes", () => {
    const a = payload();
    expect(isVaultSubset(a, a)).toBe(true);
    const bigger = mergeVaultPayloads(a, payload({ redactionVault: { x: "y" }, updatedAt: 1 }));
    expect(isVaultSubset(bigger, a)).toBe(false);
  });
});

describe("events (org audit)", () => {
  it("derives aggregate counts by category, never values", () => {
    const ev = deriveRedactionEvent(payload())!;
    expect(ev.total).toBe(2);
    expect(ev.types).toEqual({ person: 1, email: 1 });
    expect(ev.provider).toBe("openai");
    expect(JSON.stringify(ev)).not.toContain("john@acme.com");
  });

  it("skips conversations with an empty vault", () => {
    expect(deriveRedactionEvents([{ redactionVault: {} }, payload()])).toHaveLength(1);
  });
});

describe("createVaultSync", () => {
  const memoryTransport = () => {
    const store = new Map<string, { blob: unknown; updatedAt: number }>();
    const devices = new Map<string, { name: string; platform: string }>();
    const t: SyncTransport & { store: typeof store; orgReports: unknown[]; devices: typeof devices } = {
      store,
      devices,
      orgReports: [],
      async listVaults() {
        return [...store.entries()].map(([threadId, v]) => ({ threadId, updatedAt: v.updatedAt }));
      },
      async getVault(threadId) {
        const v = store.get(threadId);
        return v ? { threadId, updatedAt: v.updatedAt, blob: v.blob as any } : null;
      },
      async putVault(threadId, blob, updatedAt) {
        store.set(threadId, { blob, updatedAt });
      },
      async listOrgs() {
        return [{ organization_uuid: "org-1" }];
      },
      async getOrganization() {
        return { member_count: 0 };
      },
      async listModelPolicy() {
        return [];
      },
      async listMcpPolicy() {
        return [];
      },
      async getOrgUsage() {
        return null;
      },
      async reportRedactionEvents(_org, events) {
        t.orgReports.push(events);
      },
      async registerDevice(d) {
        devices.set(d.deviceId, { name: d.name, platform: d.platform });
      },
      async listDevices() {
        return [...devices.entries()].map(([deviceId, d]) => ({
          deviceId,
          name: d.name,
          platform: d.platform,
          lastSeenAt: 1,
          createdAt: 1,
        }));
      },
      async revokeDevice(deviceId) {
        devices.delete(deviceId);
      },
    };
    return t;
  };

  it("push then pull on a second device restores the vault", async () => {
    const transport = memoryTransport();
    const deviceA = createVaultSync({ transport, getPassphrase: () => "shared-pass" });
    const deviceB = createVaultSync({ transport, getPassphrase: () => "shared-pass" });
    await deviceA.push("thread-1", payload());
    const pulled = await deviceB.pull("thread-1");
    expect(pulled!.redactionVault["Léa Savary"]).toBe("Jean Rebour");
  });

  it("a device with the wrong passphrase can't decrypt (degrades to null)", async () => {
    const transport = memoryTransport();
    await createVaultSync({ transport, getPassphrase: () => "right" }).push("t", payload());
    const pulled = await createVaultSync({ transport, getPassphrase: () => "wrong" }).pull("t");
    expect(pulled).toBeNull();
  });

  it("reportOrgAudit sends counts to each org", async () => {
    const transport = memoryTransport();
    const sync = createVaultSync({ transport, getPassphrase: () => null });
    const n = await sync.reportOrgAudit([payload()]);
    expect(n).toBe(1);
    expect(transport.orgReports).toHaveLength(1);
  });

  it("getOrgProfile consolidates the MOST RESTRICTIVE policy across orgs", async () => {
    const orgs = [
      {
        organization_uuid: "org-a",
        organization_name: "Acme",
        role: "member",
        status: "active",
        organization_settings: { redactionPolicy: { forcedCategories: ["name"], strict: false } },
      },
      {
        organization_uuid: "org-b",
        organization_settings: { redactionPolicy: { forcedCategories: ["email"], strict: true } },
      },
    ];
    // Allow-list: only what ALL organizations authorize stays usable.
    // `gpt-5` is authorized on both sides, `o4` on only one, `grok-2` refused.
    const policies: Record<string, { model_id: string; enabled: boolean }[]> = {
      "org-a": [
        { model_id: "gpt-5", enabled: true },
        { model_id: "o4", enabled: true },
        { model_id: "grok-2", enabled: false },
      ],
      "org-b": [
        { model_id: "gpt-5", enabled: true },
        { model_id: "o4", enabled: false },
      ],
    };
    const mcpPolicies: Record<string, { server_id: string; allowed: boolean }[]> = {
      "org-a": [
        { server_id: "linear", allowed: true },
        { server_id: "gmail", allowed: false },
      ],
      "org-b": [
        { server_id: "linear", allowed: true },
        { server_id: "notion", allowed: false },
      ],
    };
    const transport = {
      ...memoryTransport(),
      async listOrgs() {
        return orgs;
      },
      async getOrganization() {
        return { member_count: 48 };
      },
      async listModelPolicy(uuid: string) {
        return policies[uuid] ?? [];
      },
      async listMcpPolicy(uuid: string) {
        return mcpPolicies[uuid] ?? [];
      },
      async getOrgUsage() {
        return null;
      },
    } as unknown as SyncTransport;
    const profile = await createVaultSync({ transport, getPassphrase: () => null }).getOrgProfile();
    expect(profile).not.toBeNull();
    expect(profile!.organizationName).toBe("Acme"); // primary = first
    expect(profile!.memberCount).toBe(48);
    expect(profile!.role).toBe("member");
    expect(profile!.status).toBe("active");
    expect([...profile!.allowedModelIds].sort()).toEqual(["gpt-5"]); // INTERSECTION, not union
    expect([...profile!.allowedMcpIds].sort()).toEqual(["linear"]);
    expect([...profile!.forcedCategories].sort()).toEqual(["email", "name"]); // union
    expect(profile!.byoKeysAllowed).toBe(false); // managed account ⇒ no personal key
  });

  it("getOrgProfile keeps the last-known-good when ONE policy call fails, and does not cache the degraded read", async () => {
    // The regression: a `/models` 5xx produced an empty policy that REPLACED
    // the good one — the unblocking then survived restarts.
    const good = {
      orgs: [], organizationName: "Acme", role: "member", status: "active",
      allowedModelIds: ["gpt-5"], allowedMcpIds: ["linear"], byoKeysAllowed: false,
      forcedCategories: ["email"],
    } as unknown as OrgProfile;
    let stored: OrgProfile | null = good;
    const orgCache = { get: () => stored, set: (p: OrgProfile | null) => { stored = p; } };
    const transport = {
      ...memoryTransport(),
      async listOrgs() {
        return [{ organization_uuid: "org-a", organization_name: "Acme" }];
      },
      async listModelPolicy(): Promise<never> {
        throw new Error("boom");
      },
      async listMcpPolicy() {
        return [{ server_id: "linear", allowed: true }];
      },
      async getOrganization() {
        return { member_count: 1 };
      },
      async getOrgUsage() {
        return null;
      },
    } as unknown as SyncTransport;
    const profile = await createVaultSync({ transport, getPassphrase: () => null, orgCache }).getOrgProfile();
    expect(profile!.allowedModelIds).toEqual(["gpt-5"]); // the good policy holds
    expect(profile!.degraded).toBe(true); // and the UI can say so
    expect(stored).toBe(good); // the cache was NOT rewritten by the partial read
  });

  it("getOrgProfile fails CLOSED (empty allow-list) on a partial read with no cache", async () => {
    const transport = {
      ...memoryTransport(),
      async listOrgs() {
        return [{ organization_uuid: "org-a" }];
      },
      async listModelPolicy(): Promise<never> {
        throw new Error("boom");
      },
      async listMcpPolicy(): Promise<never> {
        throw new Error("boom");
      },
      async getOrganization() {
        return null;
      },
      async getOrgUsage() {
        return null;
      },
    } as unknown as SyncTransport;
    const profile = await createVaultSync({ transport, getPassphrase: () => null }).getOrgProfile();
    expect(profile!.allowedModelIds).toEqual([]); // nothing authorized — the CLOSED fallback
    expect(profile!.degraded).toBe(true);
  });

  it("getOrgProfile returns null when the user belongs to no org", async () => {
    const transport = { ...memoryTransport(), async listOrgs() { return []; } } as SyncTransport;
    const profile = await createVaultSync({ transport, getPassphrase: () => null }).getOrgProfile();
    expect(profile).toBeNull();
  });

  it("getOrgProfile returns the CACHED profile when the backend is unreachable", async () => {
    const cached = { orgs: [], organizationName: "Acme", role: "owner", status: "active",
      allowedModelIds: [], allowedMcpIds: [], byoKeysAllowed: false,
      forcedCategories: [] } as unknown as OrgProfile;
    let stored: OrgProfile | null = cached;
    const orgCache = { get: () => stored, set: (p: OrgProfile | null) => { stored = p; } };
    const transport = { ...memoryTransport(),
      async listOrgs(): Promise<never> { throw new Error("offline"); } } as SyncTransport;
    const profile = await createVaultSync({ transport, getPassphrase: () => null, orgCache }).getOrgProfile();
    expect(profile).toBe(cached); // last-known-good, NOT null → org tab survives
    expect(stored).toBe(cached); // an outage never clears the cache
  });

  it("getOrgProfile CLEARS the cache on a reachable no-org", async () => {
    let stored: OrgProfile | null = { organizationName: "Stale" } as unknown as OrgProfile;
    const orgCache = { get: () => stored, set: (p: OrgProfile | null) => { stored = p; } };
    const transport = { ...memoryTransport(), async listOrgs() { return []; } } as SyncTransport;
    const profile = await createVaultSync({ transport, getPassphrase: () => null, orgCache }).getOrgProfile();
    expect(profile).toBeNull();
    expect(stored).toBeNull(); // reachable "no org" (or sign-out) clears stale cache
  });

  it("reportOrgAudit returns 0 (retryable) when a report POST fails", async () => {
    const transport = { ...memoryTransport(),
      async reportRedactionEvents() { throw new Error("500"); } } as SyncTransport;
    const n = await createVaultSync({ transport, getPassphrase: () => null }).reportOrgAudit([payload()]);
    expect(n).toBe(0); // NOT marked reported → stays in the delta, retried next time
  });

  it("registers a device and flags the current one; revoke removes it", async () => {
    const transport = memoryTransport();
    const me = { deviceId: "dev-A", name: "My Laptop", platform: "desktop" };
    const a = createVaultSync({ transport, getPassphrase: () => null, getDevice: () => me });
    const b = createVaultSync({
      transport,
      getPassphrase: () => null,
      getDevice: () => ({ deviceId: "dev-B", name: "Phone", platform: "mobile" }),
    });
    await a.registerDevice();
    await b.registerDevice();
    const fromA = await a.listDevices();
    expect(fromA).toHaveLength(2);
    expect(fromA.find((d) => d.deviceId === "dev-A")!.current).toBe(true);
    expect(fromA.find((d) => d.deviceId === "dev-B")!.current).toBe(false);
    await a.revokeDevice("dev-B");
    expect(await a.listDevices()).toHaveLength(1);
  });

  it("device methods no-op without a getDevice", async () => {
    const transport = memoryTransport();
    const sync = createVaultSync({ transport, getPassphrase: () => null });
    await sync.registerDevice();
    expect(transport.devices.size).toBe(0);
    expect(await sync.listDevices()).toEqual([]);
  });
});
