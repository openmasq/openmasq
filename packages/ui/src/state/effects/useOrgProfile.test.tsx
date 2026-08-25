// @vitest-environment jsdom
/**
 * La course « membre paraît solo » : l'effet d'ADOPTION de compte sème le
 * profil d'org depuis le cache du compte — VIDE pour un membre tout neuf — et
 * ce seed écrasait le profil que le premier fetch venait de poser, sans que
 * rien ne re-fetch avant un focus fenêtre. L'invariant réparateur : la
 * RÉSOLUTION (ou le changement) du compte re-déclenche le chargement, dont le
 * résultat REMPLACE le seed (le serveur est le seul écrivain).
 */
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import type { OrgProfileInfo } from "../../host";
import { useOrgProfile } from "./useOrgProfile";

const PROFILE: OrgProfileInfo = {
  organizationUuid: "org-1",
  organizationName: "plomberie",
  role: "owner",
  allowedModelIds: [],
  allowedMcpIds: [],
  byoKeysAllowed: false,
  forcedCategories: [],
};

function Harness({
  userId,
  getProfile,
  probe,
}: {
  userId: string | null | undefined;
  getProfile: () => Promise<OrgProfileInfo | null>;
  probe: (p: OrgProfileInfo | null) => void;
}) {
  const [profile, setProfile] = useState<OrgProfileInfo | null>(null);
  const storageUidRef = useRef<string | null | undefined>(undefined);
  probe(profile);
  useOrgProfile({
    host: { org: { getProfile } } as never,
    setOrgProfile: setProfile,
    storageUidRef,
    userId,
  });
  return <div data-profile={profile?.organizationName ?? "none"} />;
}

describe("useOrgProfile — le compte résolu re-déclenche le chargement", () => {
  it("re-fetch au changement de userId, et le résultat remplace un seed nul", async () => {
    const getProfile = vi.fn(async () => PROFILE);
    const seen: { p: OrgProfileInfo | null } = { p: null };
    const m = await mount(
      <Harness userId={undefined} getProfile={getProfile} probe={(p) => (seen.p = p)} />,
    );
    await act(async () => {}); // laisser le premier fetch se résoudre
    const callsBeforeResolve = getProfile.mock.calls.length;
    expect(callsBeforeResolve).toBeGreaterThan(0); // il charge sans attendre l'auth

    // Le compte se RÉSOUT (l'instant où l'effet d'adoption sème depuis le
    // cache, possiblement null) : le hook doit re-fetch — c'est ce re-fetch
    // qui écrase le seed vide chez un membre tout neuf.
    await m.rerender(
      <Harness userId="gerard-sub" getProfile={getProfile} probe={(p) => (seen.p = p)} />,
    );
    await act(async () => {});
    expect(getProfile.mock.calls.length).toBeGreaterThan(callsBeforeResolve);
    expect(seen.p?.organizationName).toBe("plomberie");
    expect(m.find("div").getAttribute("data-profile")).toBe("plomberie");
    await m.unmount();
  });
});
