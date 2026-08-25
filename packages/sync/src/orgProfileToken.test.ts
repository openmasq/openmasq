/**
 * « Pas de jeton » doit lire comme INCONNU — jamais comme « aucune org ».
 *
 * Le trou : au démarrage, `getAccessToken` peut rendre null avant que l'auth ne
 * soit résolue ; le transport rendait alors [] à `listOrgs`, que `getOrgProfile`
 * prenait pour un no-org JOIGNABLE — profil null + cache par compte EFFACÉ. Un
 * membre paraissait solo (carte « Créer une organisation », catégories imposées
 * envolées) sur une simple course de démarrage.
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
    const fetchSpy = vi.fn(); // tout appel réseau serait déjà une fuite d'intention
    const transport = httpTransport({
      baseUrl: "https://backend.test",
      getToken: () => null, // l'auth n'a pas encore résolu (ou déconnecté)
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
    expect(profile?.organizationUuid).toBe("org-1"); // la politique connue fait autorité
    expect(stored).toBe(KNOWN); // et le cache n'est pas réécrit en « solo »
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
    expect(stored).toBeNull(); // le VRAI no-org, lui, nettoie
  });
});
