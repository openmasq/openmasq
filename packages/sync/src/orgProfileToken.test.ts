/**
 * "No token" must read as UNKNOWN — never as "no org".
 *
 * The hole: at startup, `getAccessToken` can return null before auth
 * is resolved; the transport then returned [] to `listOrgs`, which `getOrgProfile`
 * took for a REACHABLE no-org — null profile + per-account cache CLEARED. A
 * member appeared solo ("Créer une organisation" card, forced categories
 * gone) over a mere startup race.
 */
import { describe, expect, it, vi } from "vitest";
import { createVaultSync, httpTransport } from "./index";
import type { OrgProfile } from "./types";

const KNOWN: OrgProfile = {
  orgs: [{ organization_uuid: "org-1", organization_name: "Acme", role: "member", status: "active" }],
  organizationUuid: "org-1",
  organizationName: "Acme",
  role: "member",
  allowedModelIds: ["m1"],
  allowedMcpIds: [],
  byoKeysAllowed: false,
  forcedCategories: ["email"],
};

describe("getOrgProfile sans jeton", () => {
  it("garde la dernière bonne politique, n'efface PAS le cache, ne touche pas le réseau", async () => {
    const fetchSpy = vi.fn(); // any network call would already be a leak of intent
    const transport = httpTransport({
      baseUrl: "https://backend.test",
      getToken: () => null, // auth hasn't resolved yet (or signed out)
      fetch: fetchSpy as unknown as typeof fetch,
    });
    let stored: OrgProfile | null = KNOWN;
    const cache = {
      get: () => stored,
      set: (p: OrgProfile | null) => {
        stored = p;
      },
    };
    const sync = createVaultSync({ transport, getPassphrase: () => null, orgCache: cache });

    const profile = await sync.getOrgProfile();
    expect(profile?.organizationUuid).toBe("org-1"); // the known policy is authoritative
    expect(stored).toBe(KNOWN); // and the cache isn't rewritten to "solo"
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("un compte réellement sans org (jeton présent, liste vide) rend bien null et vide le cache", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ organizations: [] }), { status: 200 }),
    );
    const transport = httpTransport({
      baseUrl: "https://backend.test",
      getToken: () => "jwt",
      fetch: fetchSpy as unknown as typeof fetch,
    });
    let stored: OrgProfile | null = KNOWN;
    const cache = {
      get: () => stored,
      set: (p: OrgProfile | null) => {
        stored = p;
      },
    };
    const sync = createVaultSync({ transport, getPassphrase: () => null, orgCache: cache });

    expect(await sync.getOrgProfile()).toBeNull();
    expect(stored).toBeNull(); // the TRUE no-org, on the other hand, clears it
  });
});
