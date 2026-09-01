// @vitest-environment jsdom
/**
 * The "member looks solo" race: the account ADOPTION effect seeds the
 * org profile from the account's cache — EMPTY for a brand new member — and
 * this seed used to overwrite the profile the first fetch had just set, with
 * nothing re-fetching before a window focus. The fixing invariant: the
 * account's RESOLUTION (or its change) re-triggers the load, whose
 * result REPLACES the seed (the server is the only writer).
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
    await act(async () => {}); // let the first fetch resolve
    const callsBeforeResolve = getProfile.mock.calls.length;
    expect(callsBeforeResolve).toBeGreaterThan(0); // it loads without waiting for auth

    // The account RESOLVES (the moment the adoption effect seeds from the
    // cache, possibly null): the hook must re-fetch — it's this re-fetch
    // that overwrites the empty seed for a brand new member.
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
