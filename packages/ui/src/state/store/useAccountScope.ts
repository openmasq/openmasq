import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AuthUser, Host, OrgProfileInfo } from "../../host";
import type { Conversation, Settings } from "../../types";
import { resolveAuthEvent } from "../auth/authEvent";
import { orgProfileKeyFor, readCachedOrgProfile } from "../auth/orgProfileCache";
import { attachDebugStore } from "../debug/debug";
import { dbLoadFailure } from "../debug/dbReport";
import { cleanVaultPollution } from "../redaction/vaultCleanup";
import { adoptSettings, reconcileDbSettings } from "../settings/settingsReconcile";
import { loadDeviceTheme } from "../settings/theme";
import { shouldImportLegacyKeysOnce } from "../../send/sendGuards";
import { activeKeyFor, clearStuckPending, convKeyFor, load, localConvSnapshot, settingsKeyFor } from "../storePersistence";
import { mergeDbConversations } from "./dbHydrateMerge";
import type { DbMirrorRefs } from "./useDbMirror";

export type UserId = string | null | undefined;

/**
 * Resolve + track the signed-in ACCOUNT id. `undefined` = not resolved yet, `null` =
 * signed out (no auth capability ⇒ a single null scope). Offline-tolerant like `useAuth`
 * (one resolver, `resolveAuthEvent`): a spurious sign-out from a transient auth outage
 * must NOT flip the id to null, or the switch below wipes the in-memory conversations.
 * A `getSession` error at boot leaves the id UNRESOLVED, never null.
 */
export function useResolveAccountId(host: Host, setUserId: (u: string | null) => void) {
  useEffect(() => {
    if (!host.auth) {
      setUserId(null);
      return;
    }
    const auth = host.auth;
    let alive = true;
    const apply = (u: AuthUser | null) => {
      if (alive) setUserId(u?.id ?? null);
    };
    auth.getSession().then(apply).catch(() => {});
    const off = auth.onChange((u) => {
      void resolveAuthEvent(auth, u).then((r) => {
        if (!alive) return;
        if (r.kind === "set") apply(r.user);
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, [host, setUserId]);
}

export interface AccountSwitchDeps {
  host: Host;
  userId: UserId;
  /** Which account the in-memory set belongs to; `undefined` until the first load. */
  storageUidRef: MutableRefObject<UserId>;
  conversationsRef: MutableRefObject<Conversation[]>;
  activeIdRef: MutableRefObject<string | null>;
  setSettings: Dispatch<SetStateAction<Settings>>;
  setOrgProfile: (p: OrgProfileInfo | null) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setActiveId: (id: string | null) => void;
  setLoaded: (v: boolean) => void;
  db: DbMirrorRefs;
  legacyKeys: Record<string, string>;
  legacyImportedRef: MutableRefObject<boolean>;
  refreshKeys: () => void;
}

/**
 * The ONE place that adopts an account. Its ORDERING is the invariant (`state/CLAUDE.md`):
 * flush the outgoing account to its scoped key → clear memory + DB mirroring → `setUser`
 * on keys/DB/MCP BEFORE any read → load this account's localStorage set → hydrate + merge
 * the DB (DB wins). Legacy unscoped keys are never read.
 */
export function useAccountSwitch(d: AccountSwitchDeps) {
  const { host, userId, storageUidRef, conversationsRef, activeIdRef, db } = d;
  const { setSettings, setOrgProfile, setConversations, setActiveId, setLoaded } = d;
  const { legacyKeys, legacyImportedRef, refreshKeys } = d;
  useEffect(() => {
    if (userId === undefined) return;
    if (storageUidRef.current === userId) return;

    const prev = storageUidRef.current;
    if (prev) {
      const pk = convKeyFor(prev);
      const pak = activeKeyFor(prev);
      try {
        if (pk) localStorage.setItem(pk, localConvSnapshot(conversationsRef.current, !!host.db));
        if (pak) {
          const a = activeIdRef.current;
          if (a) localStorage.setItem(pak, a);
          else localStorage.removeItem(pak);
        }
      } catch {
        /* localStorage unavailable */
      }
    }

    storageUidRef.current = userId;
    db.dbActive.current = false;
    setLoaded(false);
    db.savedVersions.current = new Map();
    db.revSnaps.current = new Map();
    // Settings are account-scoped too (coffre, compétences are user-owned content):
    // REPLACE from this account's key, never merge — the outgoing blob is still in memory
    // and the DB merge below never fires for an account with no persisted row. Captured
    // so the async hydrate can tell "untouched since adoption" from "edited meanwhile".
    const adoptedSettings = adoptSettings(
      userId,
      load<Partial<Settings>>(settingsKeyFor(userId), {}),
      loadDeviceTheme(),
    );
    setSettings(adoptedSettings);
    // Seed the org policy from this account's last-known cache so a member signing in
    // offline still has the mandated categories enforced; the server replaces it.
    const orgKey = orgProfileKeyFor(userId);
    setOrgProfile(orgKey ? readCachedOrgProfile(load<OrgProfileInfo | null>(orgKey, null)) : null);
    const lsKey = convKeyFor(userId);
    const localConvs = lsKey ? cleanVaultPollution(clearStuckPending(load<Conversation[]>(lsKey, []))) : [];
    setConversations(localConvs);
    const aKey = activeKeyFor(userId);
    let savedActive: string | null = null;
    try {
      savedActive = aKey ? localStorage.getItem(aKey) : null;
    } catch {
      /* localStorage unavailable */
    }
    setActiveId(
      (savedActive && localConvs.some((c) => c.id === savedActive) ? savedActive : localConvs[0]?.id) ?? null,
    );
    if (!host.db) setLoaded(true);

    let cancelled = false;
    // Per-account isolation of the live connectors and their OAuth tokens.
    void host.mcp?.setUser?.(userId)?.catch(() => {});
    // Re-scope the encrypted key store, THEN import legacy keys (once per session, flag set
    // before the await so a fast switch can't import into a second account), THEN read.
    void (async () => {
      try {
        await host.keys?.setUser?.(userId);
        if (shouldImportLegacyKeysOnce(legacyImportedRef.current, userId, Object.keys(legacyKeys).length)) {
          legacyImportedRef.current = true;
          await host.keys?.importLegacy(legacyKeys);
        }
      } catch {
        /* keep going — refreshKeys reads whatever scope resolved */
      }
      refreshKeys();
    })();
    void (async () => {
      if (!host.db) return;
      try {
        await host.db.setUser?.(userId)?.catch(() => {});
        if (cancelled) return;
        // The persisted debug journal is per account too; attach resets the ring.
        void attachDebugStore(
          userId && host.db.saveDebugJournal && host.db.loadDebugJournal
            ? { save: (j) => host.db!.saveDebugJournal!(j), load: () => host.db!.loadDebugJournal!() }
            : null,
        );
        if (!userId) return;
        const data = await host.db.load().catch(dbLoadFailure);
        if (cancelled || !data) return;
        db.dbActive.current = true;
        const cleaned = { ...data, conversations: cleanVaultPollution(clearStuckPending(data.conversations)) };
        setConversations((local) => {
          if (cleaned.conversations.length === 0) return local; // the mirror pushes local up
          const { merged, enriched } = mergeDbConversations(cleaned.conversations, local);
          // Enriched ones stay out so the mirror persists the recovered fields back.
          db.savedVersions.current = new Map(
            merged.filter((c) => !enriched.has(c.id)).map((c) => [c.id, c.updatedAt]),
          );
          return merged;
        });
        if (cleaned.settings)
          setSettings((s) => reconcileDbSettings(s, adoptedSettings, cleaned.settings as Partial<Settings>));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [host, userId]);
}
