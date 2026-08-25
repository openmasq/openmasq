/**
 * Drives the ORG-SHARE channel off the chat store (sibling of `useCoffreSync`
 * / `useUserdataSync`). Every cycle: publish this account's member key if
 * needed, drive the recipient sets of the shares this account WRITES (admit /
 * rotate), pull every READABLE share and aggregate the content into the
 * `Settings.orgCoffre` / `orgCompetences` mirrors. Proposing / deciding /
 * revoking rides the `host.orgShares` surface (`orgScopeSync.ts`), which
 * re-enters this pull through `setOrgShareContext`'s refresh callback so a
 * decision shows up without waiting for the next cycle.
 */
import { useEffect, useRef } from "react";
import type { useChatStore } from "@openmasq/ui";
import { useSyncChannel, onWindowFocus } from "@openmasq/ui";
import { pullOrgShares, setOrgShareContext } from "./orgScopeSync";

type Store = ReturnType<typeof useChatStore>;

export function useOrgScopeSync(store: Store): void {
  const setRef = useRef(store.setSettings);
  setRef.current = store.setSettings;
  const orgRef = useRef(store.orgProfile);
  orgRef.current = store.orgProfile;

  const pull = async () => {
    const orgUuid = orgRef.current?.organizationUuid;
    if (!orgUuid) return;
    const out = await pullOrgShares(orgUuid);
    if (!out) return;
    setRef.current((s) => ({ ...s, orgCoffre: out.terms, orgCompetences: out.competences }));
  };
  const pullRef = useRef(pull);
  pullRef.current = pull;

  // The Host surface acts on the CURRENT org and re-pulls after a decision.
  useEffect(() => {
    setOrgShareContext(store.orgProfile?.organizationUuid ?? null, () => pullRef.current());
    return () => setOrgShareContext(null, null);
  }, [store.orgProfile?.organizationUuid]);

  useSyncChannel({
    ready: store.syncReady && !!store.orgProfile?.organizationUuid,
    resume: onWindowFocus,
    pull: () => void pullRef.current(),
    // Shares are pushed at PROPOSAL time (host.orgShares) — nothing rides a
    // settings-edit push; the mirrors are read-only aggregates.
    push: () => {},
    pushDeps: [],
  });
}
