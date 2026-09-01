import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "../i18n";
import { redactNumbersOn } from "../send/redactNumbers";
import { modelsVersion, onModelsChanged } from "@openmasq/llm";
import type { ChatMessage } from "@openmasq/llm";
import type { Conversation, Settings, VaultTerm } from "../types";
import { makeVaultTerm, vaultHasValue } from "../send/vaultTerms";
import { useSkills } from "./settings/useSkills";
import { useMemoryStore } from "./memory/useMemory";
import { useMemoryExtraction } from "./memory/useMemoryExtraction";
import { pinMemoryNote } from "./memory/memoryExtractionRun";
import { useContextCompaction } from "./memory/useContextCompaction";
import { isSyncReady, sweepDeletions } from "./auth/dbWipeGuard";
import { askTargetLaunchText } from "../send/askTarget";
import { store as reduxStore, setMemoryFresh } from "./redux";
import { billingFor, selectBillingCache } from "./settings/settingsCache";
import { loadBilling, pollBilling } from "./settings/settingsPrefetch";
import { pseudonymize, redactionCategory, type RedactionMatch } from "@openmasq/redact";
import { cleanVaultPollution } from "./redaction/vaultCleanup";
import { makeRenameConversation } from "./conversation/renameConversation";
import { resolveAuthEvent } from "./auth/authEvent";
import { replaceDocumentInContent } from "./conversation/documentEdit";
import { redactEditedText } from "./redaction/editRedaction";
import { createSendMessage } from "../send/sendOrchestrator";
import { modelUnavailableReason, type UnavailableReason } from "../send/modelAvailability";
import { completeRouting, resolveEffectivePlatform } from "../send/routing";
import { effectiveRedactCategories, disabledKindsOf } from "../send/redactionOptions";
import { levelOf, notorietyForLevel } from "../privacy/privacyLevel";
import { isModelAllowed } from "../privacy/orgAllowList";
import { attachDebugStore } from "./debug/debug";
import { dbFailure, dbLoadFailure } from "./debug/dbReport";
import {
  useHost,
  type AuthUser,
  type CompletePayload,
  type ExtractedFile,
  type OrgProfileInfo,
  type CreditBalance,
  type BillingSubscription,
} from "../host";
import { loadReattachFile } from "../pages/Library/reattach";
import { retryResendWire, retryTagPrompt } from "../send/retryResend";
import { createStagedFiles } from "./files/stagedFiles";
import { ALL_MODELS, DEFAULT_MODEL_ID, findModelAny, } from "../prompt/models";
import { isAutoModelId } from "../send/autoRoute";
import { shouldImportLegacyKeysOnce } from "../send/sendGuards";
import { orgProfileKeyFor, readCachedOrgProfile } from "./auth/orgProfileCache";
import { SETTINGS_KEY, settingsKeyFor, convKeyFor, activeKeyFor, localConvSnapshot, DEFAULT_SETTINGS, normalizeSettings, newConversation, clearStuckPending, uid, load } from "./storePersistence";
import { loadDeviceTheme } from "./settings/theme";
import { adoptSettings, reconcileDbSettings } from "./settings/settingsReconcile";
import { useLocalPersistence, usePlatformEffects, useOrgProfile } from "./effects";
import { useLocalEndpointProbe, useClaudeCliProbe, useCodexCliProbe, useAntigravityCliProbe } from "./effects/useAvailabilityProbes";

/** One-time flag: the controllable browser was pre-connected at first run. Guards
 *  the pre-connect so disabling the browser later stays sticky (never re-enabled). */

/** Conversations whose pre-search reveal gate has already been answered. Module-level +
 *  ephemeral (like `sessionAllowedWriteTools`): the card asks ONCE per conversation, and
 *  either decision closes it for the session. */

export function useChatStore() {
  const t = useT();
  const host = useHost();
  const [settings, setSettings] = useState<Settings>(() =>
    normalizeSettings({
      // Merge over defaults so settings persisted before a field existed (e.g.
      // redactProvider) still get a value instead of `undefined`.
      ...DEFAULT_SETTINGS,
      ...load<Partial<Settings>>(SETTINGS_KEY, {}),
      // …except the theme, which is the DEVICE's (see `THEME_KEY`) — this runs before
      // auth resolves, so it must match what `applyPersistedTheme` already painted or
      // the first commit flashes a different skin.
      ...(loadDeviceTheme() ? { theme: loadDeviceTheme() } : {}),
    }),
  );
  // Start EMPTY: conversations load per-ACCOUNT once the signed-in user id resolves
  // (see the per-account load effect) — NEVER from the unscoped key, so account B
  // can't even momentarily see account A's chats on first paint.
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // True once the initial per-account load (localStorage + any async DB merge) has
  // SETTLED — lets a caller tell "genuinely empty" from "still loading". The shell's
  // startup seed keys off this, so it never fires mid-load and mints a spurious chat.
  const [loaded, setLoaded] = useState(false);
  // The signed-in account id that conversation storage is scoped to. `undefined` =
  // not resolved yet (don't load/persist); string = signed in; null = signed out.
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  // Which account the in-memory `conversations`/`activeId` currently belong to, so
  // persistence writes to the RIGHT scoped key and a switch flushes the old account
  // before loading the new one. `undefined` until the first account load runs.
  const storageUidRef = useRef<string | null | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  // Monotonic nonce bumped each time the agentic loop STARTS a controllable-browser
  // tool call — so the UI can auto-open the split browser panel to show the model
  // driving it live. A counter (not a boolean) so it re-fires per call, re-opening the
  // panel even if the user had closed it; the consumer only ever OPENS (never a reset).
  const [browserActivity, setBrowserActivity] = useState(0);
  // A request to reveal a specific message (e.g. from the redaction-audit page):
  // ChatView scrolls to `msgId` once its conversation is active. `nonce` lets the
  // SAME target retrigger a scroll if clicked twice.
  const [scrollTarget, setScrollTarget] = useState<{
    convId: string;
    msgId: string;
    nonce: number;
  } | null>(null);
  // Cancel/finish handlers keyed BY CONVERSATION id, not a single shared ref — the
  // app runs browser-style tabs that can each generate at once, so Stop must reach
  // the turn the user is watching (its own conversation), never whichever send
  // registered last. `cancel` aborts the in-flight generation; `finish` resolves the
  // stream so Stop finalizes immediately (some transports don't emit a completion
  // event of their own). Each send registers under its `convId` and clears its own
  // key on settle.
  const cancelRef = useRef<Map<string, () => void>>(new Map());
  const finishRef = useRef<Map<string, () => void>>(new Map());
  // RESUME (Option B): the wire transcript of a partially-completed turn, keyed by
  // `turnId`, so a "Réessayer" CONTINUES from where it stopped rather than re-running
  // the whole turn. IN-MEMORY only (session-scoped): it holds the redacted transcript,
  // and a retry after a full reload gracefully degrades to Option A (idempotent replay).
  // Bounded to the most recent turns. Cleared implicitly — only `regenerate` reads it,
  // and only for a FAILED bubble, so a succeeded turn's stale entry is never consulted.
  const resumeTranscriptsRef = useRef<Map<string, ChatMessage[]>>(new Map());

  // API keys live encrypted in the main process (Host.keys); the renderer only
  // tracks WHICH ids are configured (for validation + the write-only Settings UI).
  const [keyConfigured, setKeyConfigured] = useState<Set<string>>(new Set());
  const refreshKeys = useCallback(() => {
    host.keys?.configured().then((ids) => setKeyConfigured(new Set(ids))).catch(() => {});
  }, [host]);
  const setApiKey = useCallback(
    async (id: string, value: string) => {
      await host.keys?.set(id, value);
      refreshKeys();
    },
    [host, refreshKeys],
  );
  const clearApiKey = useCallback(
    async (id: string) => {
      await host.keys?.clear(id);
      refreshKeys();
    },
    [host, refreshKeys],
  );

  // Organization authorization (membership/role + allowed-models & mandated
  // redaction policy). Loaded from the platform's optional org capability and
  // refreshed on sign-in/out. `null` = solo user (no org / signed out / backend
  // off) → nothing is enforced, behaviour is unchanged. Kept in a ref too so the
  // (stably-memoised) send pipeline always reads the latest without a dep change.
  const [orgProfile, setOrgProfile] = useState<OrgProfileInfo | null>(null);
  const orgProfileRef = useRef<OrgProfileInfo | null>(null);
  orgProfileRef.current = orgProfile;
  // Loading + refreshes (sign-in/out, window focus, backoff): the
  // detail lives in `effects/useOrgProfile.ts` (extraction rule 1).
  useOrgProfile({ host, setOrgProfile, storageUidRef, userId });

  // Personal (individual, per-person) prepaid credit budget + subscription — for a SOLO
  // user (not in an org). The budget gates platform-provided answer-model sends the same
  // way the org budget does; the subscription tells a PAYING account (tier ≠ "free") from
  // a free one, which is what decides both the picker's greying and whether a blocked
  // send offers the subscribe / own-key cards. Absent `host.billing` / an org member →
  // unused (the org budget applies).
  //
  // ⚠️ Read from the SHARED billing cache, never fetched into a second copy here (rule 9):
  // a private copy loaded once at boot is what made "j'ai payé et seuls les modèles
  // gratuits sont proposés" possible — the checkout-return refresh updated the cache (so
  // Réglages → Paiement showed the new plan) while this copy kept its boot-time
  // `tier:"free"`, greying every paid model until the app restarted. The store lives
  // ABOVE the redux Provider, hence `useSyncExternalStore` on the singleton store rather
  // than `useAppSelector`.
  const billingCache = useSyncExternalStore(reduxStore.subscribe, () =>
    selectBillingCache(reduxStore.getState()),
  );
  const { sub: personalSub, credits: personalCredits } = useMemo(
    () => billingFor(billingCache, userId),
    [billingCache, userId],
  );
  const personalCreditsRef = useRef<CreditBalance | null>(null);
  personalCreditsRef.current = personalCredits;
  const personalSubRef = useRef<BillingSubscription | null>(null);
  personalSubRef.current = personalSub;
  // Kept current each render so the render-STABLE `detectPii` (the composer calls it
  // on a debounce as the user types) reads the latest settings/conversation WITHOUT
  // changing identity — an unstable callback would make the composer's debounce
  // effect re-subscribe every render and never settle (send stuck "blocked").
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  // `host` too — the HostProvider value isn't guaranteed memoised, so reading it via
  // a ref lets `detectPii` be truly render-stable (deps `[]`).
  const hostRef = useRef(host);
  hostRef.current = host;

  // Per-conversation UNSENT composer drafts. Held in a REF, not state, so:
  //  • a draft SURVIVES ChatView unmounting (navigating to Library/Settings) and
  //    tab switches — the store lives above the whole shell;
  //  • typing doesn't re-render every store consumer (no state churn per keystroke);
  //  • it's keyed by conversation so drafts never leak between tabs.
  // Deliberately NEVER persisted to disk — a half-typed (possibly sensitive) message
  // stays in memory only, and is dropped on send / when its conversation is deleted.
  const draftsRef = useRef<Record<string, string>>({});
  const getDraft = useCallback((id: string) => draftsRef.current[id] ?? "", []);
  const setDraft = useCallback((id: string, text: string) => {
    if (text) draftsRef.current[id] = text;
    else delete draftsRef.current[id];
  }, []);

  // STAGED ATTACHMENTS — the files dropped on the composer but not yet sent. Same home and
  // same reasons as the draft above; the keyed store itself is `state/stagedFiles.ts`,
  // where the two bugs it closes are stated and pinned.
  const stagedRef = useRef(createStagedFiles());
  const getStagedAttachments = useCallback((id: string) => stagedRef.current.get(id), []);
  const setStagedAttachments = useCallback(
    (id: string, items: readonly unknown[]) => stagedRef.current.set(id, items),
    [],
  );

  // Resolve + track the signed-in ACCOUNT id — conversation storage is scoped to
  // it (see `convKeyFor` + the per-account load effect). `onChange` fires the
  // initial session and every sign-in/out/switch; `getSession` seeds the first
  // value. No auth capability (browser preview) ⇒ a single null "signed-out" scope.
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
    // Offline-tolerant, EXACTLY like `useAuth` (rule 9 — one resolver, `resolveAuthEvent`):
    // a spurious `SIGNED_OUT` from a transient auth-server outage must NOT flip `userId` to
    // null here, or the account-adopt effect below WIPES the in-memory conversations + closes
    // MCP even while `useAuth` (which already re-verifies) keeps the user signed in — the
    // reported "reconnecté sans plus aucune conversation, mcp". A null event re-verifies via
    // `getSession()`; a `keep` verdict leaves `userId` untouched. On a getSession error at
    // boot, stay UNRESOLVED (`undefined`) — the adopt effect returns early on it — never null.
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
  }, [host]);

  // Fill that cache. The store needs it FIRST (the picker greys on it), so it doesn't
  // wait for a visit to Réglages — `loadBilling` stays the single fetch path, and the
  // Settings prefetch then finds it already loaded. Re-runs per ACCOUNT (`undefined` =
  // not resolved yet: there is nothing to key a per-account snapshot on).
  useEffect(() => {
    if (!host.billing || userId === undefined) return;
    void loadBilling(host, reduxStore.dispatch, userId);
  }, [host, userId]);

  // …and again on the way back from Stripe Checkout (the `<protocol>://billing/callback`
  // deep link), polling because the plan only flips once Stripe's webhook lands. The
  // Paiement tab polls too, but it may not be mounted — the upgrade CTA also lives in the
  // chat — and it is this refresh that un-greys the model picker in the session that paid.
  useEffect(() => {
    const billing = host.billing;
    if (!billing?.onReturn || userId === undefined) return;
    let cancel: (() => void) | undefined;
    const off = billing.onReturn(() => {
      cancel?.();
      cancel = pollBilling(host, reduxStore.dispatch, userId);
    });
    return () => {
      cancel?.();
      off?.();
    };
  }, [host, userId]);

  // Capture legacy plaintext keys from the persisted blob at FIRST RENDER, before
  // the settings-persist effect rewrites localStorage (normalizeSettings strips
  // them). They're migrated into the encrypted main store below.
  const [legacyKeys] = useState<Record<string, string>>(() => {
    const raw = load<Record<string, unknown>>(SETTINGS_KEY, {});
    const apiKeys = (raw.apiKeys ?? {}) as Record<string, string>;
    const redactKey = raw.redactModelApiKey as string | undefined;
    return { ...apiKeys, ...(redactKey ? { redactModel: redactKey } : {}) };
  });
  // The legacy plaintext-localStorage keys must migrate into the FIRST account that signs
  // in this session, and NEVER into a second one (audit M11): `legacyKeys` is the shared,
  // pre-account-isolation blob, so importing it on every account-switch effect would write
  // account A's provider keys into account B's encrypted store. The encrypted-FILE adoption
  // (`keys.ts` `maybeAdoptLegacy`) is already marker-guarded to the first account; this ref
  // gives the localStorage path the same once-only semantics.
  const legacyImportedRef = useRef(false);

  // NOTE: the one-time legacy plaintext-localStorage key migration is folded into the
  // per-account `keys.setUser` block (in the userId effect below) so it imports into the
  // SIGNED-IN account's scoped store — never a pre-scope / previous-account one.

  // Persist on change (localStorage = instant offline cache + fallback). Conversations
  // go to the ACCOUNT-scoped key; skipped until the account resolves (storageUid set
  // by the load effect) and when signed out — so we never write to the unscoped key
  // nor one account's chats under another's/no key.
  // DEBOUNCED (700 ms, like the DB mirror below): `conversations` changes on EVERY
  // streamed token, and `localConvSnapshot` JSON.stringifies the whole set — re-writing
  // it per token made a long session progressively janny (O(n²) serialisation, worst on
  // mobile/web where the vault isn't stripped). The timeout resets each change, so a
  // streaming burst produces ONE write ~700 ms after it settles. The account-SWITCH path
  // (below) still flushes synchronously, and the DB is the durable copy on desktop.


  // The localStorage mirror + the platform pushes/warm-ups live in `./effects/`
  // (rule 1). `keepListRef` comes BACK from the hook because `detectPii`/`sendMessage`
  // read it synchronously — it is a cache, not an effect's private state.
  useLocalPersistence({ conversations, settings, activeId, userId, host, storageUidRef, setSettings });
  const { keepListRef } = usePlatformEffects({ settings, host, hostRef, setSettings, orgProfile });

  // ── Durable storage (Turso) ────────────────────────────────────────────────
  // When a DB is configured, it's the source of truth: hydrate from it on
  // mount (migrating any local-only conversations up), then mirror every change.
  const dbActive = useRef(false);
  const savedVersions = useRef(new Map<string, number>());
  // Last-persisted identity of each conversation's REVERSIBILITY blob (vault, salt,
  // kinds, checkpoint, ledger). These fields flush to the DB IMMEDIATELY, outside the
  // 700 ms debounce below: the debounce re-arms on every streamed token, so during a
  // whole stream nothing reaches disk — a crash would lose the vault of a turn whose
  // redacted text already LEFT the machine, and "reversibility is the product". The
  // debounce stays for message bodies (it is what avoids O(n²) serialisation).
  const revSnaps = useRef(new Map<string, unknown[]>());

  useEffect(() => {
    if (userId === undefined) return; // account not resolved yet — memory stays empty
    if (storageUidRef.current === userId) return; // no account change

    // 1) Flush the OUTGOING account's in-memory set to its scoped key (belt-and-
    //    suspenders — the persist effect already keeps it current).
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

    // 2) Adopt the new account: reset DB mirroring + load its localStorage set (empty
    //    when signed out). This is what makes the switch show the RIGHT account.
    storageUidRef.current = userId;
    dbActive.current = false;
    setLoaded(false); // this account's load starts now; flips true once it settles
    savedVersions.current = new Map();
    revSnaps.current = new Map();
    // Settings are account-scoped too — `coffre` (real sensitive values) and
    // `competences` are user-owned content. Overwrite from THIS account's key rather
    // than merging: the outgoing account's blob is still in memory, and the DB merge
    // below is a shallow `{...s, ...cleaned.settings}` that never fires at all for an
    // account with no persisted row — so A's coffre would keep rendering under B, and
    // B's next settings change would persist A's PII into B's encrypted DB. Replacing
    // is also what makes the sign-out → sign-in path clean without a page reload.
    // Captured so the ASYNC DB hydrate below can tell "settings untouched since
    // adoption" (safe to let the DB blob win) from "the user changed them meanwhile"
    // (keep the edit) — see `reconcileDbSettings`. This is what stops the async load
    // from clobbering a first-run onboarding choice.
    // …with ONE exception, `adoptSettings`: the theme is the DEVICE's when signing out,
    // never the pre-account blob's (which would restyle the app the instant you log out).
    const adoptedSettings = adoptSettings(
      userId,
      load<Partial<Settings>>(settingsKeyFor(userId), {}),
      loadDeviceTheme(),
    );
    setSettings(adoptedSettings);
    // Seed the org policy from THIS account's last-known cache before the network says
    // anything. A member who signs in offline (or whose org API is down) then still has
    // their mandated categories enforced instead of silently sending as a solo user.
    // Replaced the moment `getProfile()` succeeds — the server is the only writer.
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
      (savedActive && localConvs.some((c) => c.id === savedActive)
        ? savedActive
        : localConvs[0]?.id) ?? null,
    );
    // With NO durable DB the localStorage set above IS the whole load → settled now.
    // (The DB path flips `loaded` in the async block's `finally` once its merge lands.)
    if (!host.db) setLoaded(true);

    // 3) Point the local DB at THIS account's file, THEN hydrate + merge (DB wins).
    //    Awaiting `setUser` before `load` guarantees we never read the previous
    //    account's DB.
    let cancelled = false;
    // Re-scope MCP integrations to THIS account (per-account isolation, mirrors the DB
    // below): closes the previous account's live connectors + re-points MCP storage, so a
    // shared machine never leaves one account's connected integrations (and their OAuth
    // tokens) usable by another. Independent of the DB load; a later switch's own setUser
    // supersedes. Optional — absent on platforms without a per-account MCP bridge.
    void host.mcp?.setUser?.(userId)?.catch(() => {});
    // Re-scope the ENCRYPTED API-KEY store to THIS account (privacy isolation, mirrors the
    // DB + MCP re-scoping) — so a shared machine can NEVER let account B use account A's
    // provider keys — THEN refresh which ids are configured for the new account (await the
    // set-user so `configured()` reads the RIGHT scope, never the previous account's).
    void (async () => {
      try {
        await host.keys?.setUser?.(userId);
        // Fold the one-time legacy plaintext-localStorage key migration in HERE — AFTER the
        // store is scoped — so it lands in the signed-in account's store, never a pre-scope
        // (unpersisted) or previous-account one. Guarded to run AT MOST ONCE per session
        // (audit M11): the flag is set BEFORE the await so a later account switch can never
        // re-import the shared blob into a second account, even if this call is slow/failing.
        if (
          shouldImportLegacyKeysOnce(
            legacyImportedRef.current,
            userId,
            Object.keys(legacyKeys).length,
          )
        ) {
          legacyImportedRef.current = true;
          await host.keys?.importLegacy(legacyKeys);
        }
      } catch {
        /* keep going — refreshKeys reads whatever scope resolved */
      }
      refreshKeys();
    })();
    void (async () => {
      if (!host.db) return; // loaded already set synchronously above
      try {
        await host.db.setUser?.(userId)?.catch(() => {});
        if (cancelled) return;
        // Re-point + hydrate the persisted DEBUG JOURNAL for THIS account (the attach
        // resets the ring first, so an account switch never carries entries across).
        // Signed out / slot absent ⇒ memory-only, previous ring dropped.
        void attachDebugStore(
          userId && host.db.saveDebugJournal && host.db.loadDebugJournal
            ? {
                save: (j) => host.db!.saveDebugJournal!(j),
                load: () => host.db!.loadDebugJournal!(),
              }
            : null,
        );
        if (!userId) return; // signed out → no DB for this scope
        const data = await host.db.load().catch(dbLoadFailure);
        if (cancelled || !data) return; // null => DB absent OR unreadable (reported — dbReport.ts)
        dbActive.current = true;
      // Same fix on the DB copy: a message left `pending` = a stream cut off
      // by a prior reload/quit → mark it incomplete (not a frozen loader).
      const cleaned = { ...data, conversations: cleanVaultPollution(clearStuckPending(data.conversations)) };
      setConversations((local) => {
        if (cleaned.conversations.length > 0) {
            // DB wins — but restore message `attachments` (file chips) the DB
            // version may lack from the richer localStorage copy (matched by
            // message id), so attached documents survive a reload.
            const localById = new Map(local.map((c) => [c.id, c]));
            const enriched = new Set<string>();
            const merged = cleaned.conversations.map((c) => {
              const lc = localById.get(c.id);
              if (!lc) return c;
              const lmById = new Map(lc.messages.map((m) => [m.id, m]));
              let changed = false;
              const messages = c.messages.map((m) => {
                const lm = lmById.get(m.id);
                let next = m;
                if (lm) {
                  // Restore fields the DB might not carry from the richer
                  // localStorage copy: file chips, token usage, the pinned
                  // answering model AND the tool-struggle hint — so per-message
                  // badges/stats and the "try a stronger model" banner all
                  // survive a reload (not just when the DB column is populated).
                  if (!m.attachments?.length && lm.attachments?.length) {
                    next = { ...next, attachments: lm.attachments };
                    changed = true;
                  }
                  if (!m.usage && lm.usage) {
                    next = { ...next, usage: lm.usage };
                    changed = true;
                  }
                  if (!m.model && lm.model) {
                    next = { ...next, model: lm.model };
                    changed = true;
                  }
                  if (!m.toolStruggle && lm.toolStruggle) {
                    next = { ...next, toolStruggle: lm.toolStruggle };
                    changed = true;
                  }
                  if (!m.toolCalls?.length && lm.toolCalls?.length) {
                    next = { ...next, toolCalls: lm.toolCalls };
                    changed = true;
                  }
                  // The compétence tag. The DB owns it (its `prompt` is real user text,
                  // stripped from the localStorage copy) — but a message sent BEFORE the
                  // `competence` column existed has none there, and DB-wins would drop the
                  // tag for good. localStorage still holds its `id`/`name`, which is the
                  // tag; the accordion then says the instruction is unavailable rather
                  // than implying it was empty.
                  if (!m.competence && lm.competence) {
                    next = { ...next, competence: lm.competence };
                    changed = true;
                  }
                  // The OLD "workflow" tag — same rule. It is no longer written, but it
                  // is in history already persisted: not bringing it back here would make
                  // an old turn's label disappear on the first DB load.
                  if (!m.workflow && lm.workflow) {
                    next = { ...next, workflow: lm.workflow };
                    changed = true;
                  }
                  // Completion status: localStorage is the freshest same-device copy
                  // (written synchronously every chunk), so it decides whether this
                  // reply actually finished. Clear a stale DB `incomplete` when local
                  // shows it done (restoring local's fuller streamed content), and
                  // carry local's incomplete when the DB row predates the incomplete
                  // column — so the "Réponse interrompue — Réessayer" notice is
                  // neither lost nor shown spuriously after a reload.
                  const localDone =
                    !lm.incomplete && !lm.pending && !!lm.content?.trim();
                  if (m.incomplete && localDone) {
                    next = { ...next, incomplete: undefined, content: lm.content };
                    changed = true;
                  } else if (!m.incomplete && !m.error && (lm.incomplete || lm.pending)) {
                    next = { ...next, incomplete: true };
                    changed = true;
                  }
                }
                // Last-resort model pin: older API replies still carry the
                // answering model inside `usage.model` even when `model` was
                // never persisted — recover it so the badge isn't rewritten.
                if (!next.model && next.usage?.model) {
                  next = { ...next, model: next.usage.model };
                  changed = true;
                }
                return next;
              });
              // Restore per-conversation REDACTION config the DB copy may lack: an
              // override set just before this reload (inside the save-debounce window)
              // or a chat from before the `redaction_config` column existed. These live
              // in localStorage too (NOT stripped like the vault), so the "Cette
              // conversation" redaction rules must not silently revert to the global
              // defaults. Belt to the DB persistence (migration 0015).
              let out = changed ? { ...c, messages } : c;
              const restoreRedaction =
                (!out.redactCategories && !!lc.redactCategories) ||
                (!out.revealedValues?.length && !!lc.revealedValues?.length) ||
                (!out.forcedRedactions?.length && !!lc.forcedRedactions?.length);
              if (restoreRedaction) {
                out = {
                  ...out,
                  redactCategories: out.redactCategories ?? lc.redactCategories,
                  revealedValues: out.revealedValues?.length ? out.revealedValues : lc.revealedValues,
                  forcedRedactions: out.forcedRedactions?.length
                    ? out.forcedRedactions
                    : lc.forcedRedactions,
                };
              }
              if (out === c) return c;
              enriched.add(c.id);
              return out;
            });
            // Remember the DB versions so we don't re-save unchanged ones — but
            // leave the enriched ones out so the mirror effect persists the
            // recovered attachments back to the DB.
            savedVersions.current = new Map(
              merged
                .filter((c) => !enriched.has(c.id))
                .map((c) => [c.id, c.updatedAt]),
            );
            return merged;
          }
          // Empty DB: keep local and let the mirror effect push it up.
          return local;
        });
        if (cleaned.settings)
          setSettings((s) =>
            reconcileDbSettings(s, adoptedSettings, cleaned.settings as Partial<Settings>),
          );
      } finally {
        // Load settled (data merged, empty DB, or a load error) → the shell may now
        // seed a startup conversation. Skipped if this run was superseded (account switch).
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [host, userId]);

  // Mirror conversation changes to the DB (debounced; only what changed).
  useEffect(() => {
    if (!host.db || !dbActive.current) return;
    // Reversibility blob first, UN-debounced (see `revSnaps`). Identity comparison:
    // these fields are only ever replaced wholesale by a patch (never mutated in
    // place by the store), so a changed reference IS a changed blob — and streamed
    // tokens, which only touch `messages`, never trigger this pass. First sight of a
    // conversation (boot hydration, creation) seeds the snapshot without saving; the
    // debounced pass below owns that write.
    for (const c of conversations) {
      const sig = [c.redactionVault, c.redactionSalt, c.redactionKinds, c.turnCheckpoint, c.writeLedger];
      const prev = revSnaps.current.get(c.id);
      revSnaps.current.set(c.id, sig);
      if (prev && sig.some((v, i) => v !== prev[i])) {
        host.db!.saveConversation(c).catch(dbFailure("save-conversation"));
        savedVersions.current.set(c.id, c.updatedAt);
      }
    }
    const t = setTimeout(() => {
      const current = new Map(conversations.map((c) => [c.id, c.updatedAt]));
      for (const c of conversations) {
        if (savedVersions.current.get(c.id) !== c.updatedAt) {
          host.db!.saveConversation(c).catch(dbFailure("save-conversation"));
        }
      }
      sweepDeletions(savedVersions.current, current, (id) => host.db!.deleteConversation(id).catch(dbFailure("delete-conversation")));
      savedVersions.current = current;
    }, 700);
    return () => clearTimeout(t);
  }, [host, conversations]);

  useEffect(() => {
    if (!host.db || !dbActive.current) return;
    const t = setTimeout(() => host.db!.saveSettings(settings).catch(dbFailure("save-settings")), 700);
    return () => clearTimeout(t);
  }, [host, settings]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const patchConversation = useCallback(
    (id: string, patch: (c: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? patch(c) : c)),
      );
    },
    [],
  );

  const renameConversation = useMemo(
    () => makeRenameConversation(patchConversation),
    [patchConversation],
  );

  // Preferred model for a NEW chat — read via a ref so the callback stays stable.
  // Keep whatever the user is currently on (the active conversation's model),
  // else their saved default, else the built-in default. This way the model
  // selected in a conversation carries over when opening a new one.
  const newChatModelRef = useRef(DEFAULT_MODEL_ID);
  // Allow-list: a model that isn't open never carries over and never becomes the default.
  const orgBlocks = (id: string | undefined): boolean =>
    !isModelAllowed(id, orgProfile?.allowedModelIds);
  newChatModelRef.current =
    // Don't carry over / default to a model the org has disabled. AUTO is a valid
    // carry-over/default: it is a MODE, not a registry id, so it bypasses the
    // findModelAny existence check (which would silently drop it).
    [
      conversations.find((c) => c.id === activeId)?.modelId,
      settings.defaultModelId &&
        (isAutoModelId(settings.defaultModelId)
          ? settings.defaultModelId
          : findModelAny(settings.defaultModelId)?.id),
    ].find((id) => id && !orgBlocks(id)) || DEFAULT_MODEL_ID;

  // Which models can't actually SEND right now, and why — id → reason, for the pickers
  // to FLAG (Composer's `ModelSelector`, the Compte default-model picker). Computed
  // with the SAME `modelUnavailableReason` the fail-closed send gate uses, so a flagged
  // row and a refused send always agree (rule 9). The picker DISABLES a row only for a
  // `pickerBlocks` reason (nothing to call); a money/key-gated model stays selectable
  // and the send's inline container explains the escapes. `preflightError` still
  // re-checks every send. Org-blocked models are absent here on purpose: they're
  // HIDDEN by `selectableModels`, not greyed.
  // The two availability probes (local endpoint, Claude Code CLI) + their
  // ref mirrors for `sendMessage` — extracted into `effects/useAvailabilityProbes.ts`
  // (the WHY of each fail-open/fail-closed polarity lives there).
  const { localEndpointReachable, localEndpointReachableRef } = useLocalEndpointProbe(
    host,
    settings.openaiCompatBaseUrl,
  );
  const { claudeCliDetected, claudeCliReady, claudeCliReadyRef } = useClaudeCliProbe(
    host,
    settings.claudeCliEnabled,
  );
  const { codexCliDetected, codexCliReady, codexCliReadyRef } = useCodexCliProbe(
    host,
    settings.codexCliEnabled,
  );
  const { antigravityCliDetected, antigravityCliReady, antigravityCliReadyRef } =
    useAntigravityCliProbe(host, settings.antigravityCliEnabled);

  // The OpenRouter live-catalogue merge mutates MODELS IN PLACE (`setDynamicModels`),
  // which no dep below can see — without this version the late-fetched models never
  // entered the map, so some OpenRouter cards said « Clé requise » (static baseline)
  // and others nothing (live merge): the same key, two different claims.
  const registryVersion = useSyncExternalStore(onModelsChanged, modelsVersion, modelsVersion);
  const unavailableModels = useMemo(() => {
    const map = new Map<string, UnavailableReason>();
    for (const m of ALL_MODELS) {
      const reason = modelUnavailableReason({
        model: m,
        effectivePlatform: resolveEffectivePlatform(m.provider, m.id, settings.billingMode, keyConfigured),
        orgProfile,
        personalCredits,
        personalSub,
        keyConfigured,
        openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
        localEndpointReachable,
        claudeCliReady,
        codexCliReady,
        antigravityCliReady,
      });
      if (reason) map.set(m.id, reason);
    }
    return map as ReadonlyMap<string, UnavailableReason>;
  }, [
    keyConfigured,
    settings.billingMode,
    settings.openaiCompatBaseUrl,
    localEndpointReachable,
    claudeCliReady,
    codexCliReady,
    antigravityCliReady,
    orgProfile,
    personalCredits,
    personalSub,
    registryVersion,
  ]);

  /** The ref first, the state second: `conversationsRef` is only reassigned at RENDER, and
   *  creating THEN sending happens in ONE SINGLE handler (new tab, home) — the
   *  ref lagging by one beat made the send answer on `DEFAULT_MODEL_ID`. Every
   *  creation goes through here; `state/liveConversations.test.tsx` proves it. */
  const addConversations = useCallback((fresh: Conversation[]) => {
    if (!fresh.length) return;
    conversationsRef.current = [...fresh, ...conversationsRef.current];
    setConversations((prev) => [...fresh, ...prev]);
  }, []);

  const createConversation = useCallback(() => {
    const conv = newConversation(newChatModelRef.current);
    addConversations([conv]);
    setActiveId(conv.id);
    return conv.id;
  }, [addConversations]);

  /** Merge conversations parsed from another assistant's OFFICIAL export (Réglages →
   *  Compte, BETA — `src/import/`). Parsers mint STABLE ids (`imp-<provider>-<id>`),
   *  so dedup by id makes a re-import idempotent. Persistence (debounced local
   *  snapshot + encrypted DB mirror, per-account) rides the normal `conversations`
   *  effects — nothing bespoke. */
  const importConversations = useCallback((incoming: Conversation[]) => {
    const existing = new Set(conversationsRef.current.map((c) => c.id));
    const fresh = incoming.filter((c) => !existing.has(c.id));
    addConversations(fresh);
    return { added: fresh.length, skipped: incoming.length - fresh.length };
  }, [addConversations]);

  // Activate a conversation AND ask the chat view to scroll to a given message —
  // the audit page's "jump to this message" action. The caller also switches the
  // app back to the chat section.
  const openConversationAt = useCallback((convId: string, msgId: string) => {
    setActiveId(convId);
    setScrollTarget((prev) => ({ convId, msgId, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);
  const clearScrollTarget = useCallback(() => setScrollTarget(null), []);

  /** Fork a conversation FROM a message (kit): a duplicate thread holding the
   *  messages up to AND INCLUDING it. The redaction lineage rides along ON PURPOSE —
   *  same vault, same kinds, same SALT — so the copied turns stay reversible and the
   *  continued thread keeps ONE fake per value (the content already shares its fakes
   *  with the parent; a fresh salt would split identities mid-thread). The memory
   *  watermark is clamped to the cut so un-extracted turns stay extractable. */
  const forkConversation = useCallback(
    (sourceId: string, messageId: string): string | null => {
      const src = conversationsRef.current.find((c) => c.id === sourceId);
      if (!src) return null;
      const idx = src.messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return null;
      const id = uid();
      const now = Date.now();
      const fork: Conversation = {
        ...src,
        id,
        title: `${src.title || "Conversation"} (fork)`,
        messages: src.messages.slice(0, idx + 1).map((m) => ({ ...m })),
        redactionVault: { ...(src.redactionVault ?? {}) },
        redactionKinds: { ...(src.redactionKinds ?? {}) },
        memoryWatermark: Math.min(src.memoryWatermark ?? 0, idx + 1),
        createdAt: now,
        updatedAt: now,
      };
      addConversations([fork]);
      setActiveId(id);
      return id;
    },
    [addConversations],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      delete draftsRef.current[id]; // drop its unsent draft too
      stagedRef.current.drop(id); // …and the files staged for it
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        setActiveId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
        return next;
      });
    },
    [],
  );

  const setModel = useCallback(
    (id: string, modelId: string) => {
      patchConversation(id, (c) => ({ ...c, modelId }));
    },
    [patchConversation],
  );

  /** Edit a generated DOCUMENT (a ```document fence) inside an assistant message —
   *  the DocumentCard editor's persistence. The fence's inner markdown IS the
   *  document's source of truth (the .docx/.pdf are derived at download), and the
   *  stored content is the un-redacted text, so the user edits their REAL data.
   *  ⚠️ Rule 7/11: `buildWireHistory` only REPLAYS the vault on past turns — it
   *  never re-detects them — so BEFORE persisting, the edit-time redaction pass
   *  (`redactEditedText`, the import pass's sibling) puts any NEW hand-typed
   *  value into the conversation vault; the next send then redacts it like the
   *  rest. The pass failing, or no fence matching, REFUSES the save (false) —
   *  never a partial write, never an un-vaulted edit. Persistence + record-sync
   *  re-emission follow from the conversation effects (msgSig change). */
  const editDocument = useCallback(
    async (
      conversationId: string,
      messageId: string,
      oldText: string,
      newText: string,
    ): Promise<boolean> => {
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conv) return false;
      let vaultPatch: Awaited<ReturnType<typeof redactEditedText>>;
      try {
        const effective = effectiveRedactCategories(
          settingsRef.current.redactCategories,
          conv.redactCategories,
          orgProfileRef.current?.forcedCategories,
        );
        vaultPatch = await redactEditedText(
          conv,
          newText,
          disabledKindsOf(effective),
          notorietyForLevel(levelOf(effective, orgProfileRef.current?.forcedCategories)),
        );
      } catch {
        return false; // fail closed — no save without the redaction pass
      }
      let done = false;
      patchConversation(conversationId, (c) => {
        const idx = c.messages.findIndex((m) => m.id === messageId);
        if (idx === -1) return c;
        const next = replaceDocumentInContent(c.messages[idx]!.content, oldText, newText);
        if (next === null) return c;
        done = true;
        const messages = c.messages.map((m, i) => (i === idx ? { ...m, content: next } : m));
        return { ...c, messages, ...vaultPatch, updatedAt: Date.now() };
      });
      return done;
    },
    [patchConversation],
  );

  // RECORD-SYNC entry point (desktop/mobile `useConvSync` → @openmasq/sync
  // `applyPulled`): upsert a conversation merged from another device, or remove
  // one deleted there (`null`). Persistence follows automatically — the
  // conversations effects own localStorage/DB, at-rest stripping included.
  const applySyncedConversation = useCallback((convId: string, conv: Conversation | null) => {
    setConversations((prev) => {
      if (!conv) {
        setActiveId((cur) => (cur === convId ? null : cur));
        return prev.filter((c) => c.id !== convId);
      }
      const i = prev.findIndex((c) => c.id === convId);
      if (i < 0) return [conv, ...prev];
      const next = [...prev];
      next[i] = conv;
      return next;
    });
  }, []);

  // Merge an EXTERNAL vault into a conversation — e.g. the reversible map pulled
  // from another of the user's devices via `@openmasq/sync`. Additive & behavior-
  // preserving: a value maps to a stable placeholder, so a "collision" is the same
  // pair; we still let the LOCAL mapping win (spread it last) so an in-flight local
  // edit is authoritative. No-op when there's nothing to merge.
  const mergeVaultInto = useCallback(
    (id: string, vault: Record<string, string>, kinds: Record<string, string> = {}) => {
      if (!Object.keys(vault).length && !Object.keys(kinds).length) return;
      patchConversation(id, (c) => ({
        ...c,
        redactionVault: { ...vault, ...c.redactionVault },
        redactionKinds: { ...kinds, ...c.redactionKinds },
      }));
    },
    [patchConversation],
  );

  // Per-conversation redaction category override (sparse — undefined keys inherit
  // the global Settings.redactCategories). Pass the full override map; pass {} to
  // clear it (inherit everything).
  const setConversationCategories = useCallback(
    (id: string, redactCategories: Conversation["redactCategories"]) => {
      patchConversation(id, (c) => ({
        ...c,
        redactCategories:
          redactCategories && Object.keys(redactCategories).length ? redactCategories : undefined,
        updatedAt: Date.now(),
      }));
    },
    [patchConversation],
  );

  /** « Sans mémoire dans cette conversation » (rules modal): cuts injection,
   *  the memory-search tool AND the silent extraction for THIS
   *  conversation. An explicit « retiens que… » request is still honoured. */
  const setConversationMemoryOff = useCallback(
    (id: string, off: boolean) => {
      patchConversation(id, (c) => ({ ...c, memoryOff: off || undefined, updatedAt: Date.now() }));
    },
    [patchConversation],
  );

  /** Toggle the NEUTRAL-MARKS display mode for one conversation (display-only —
   *  detection/vault/wire unchanged; the flag persists with the conversation). */
  const toggleConversationNeutralMarks = useCallback(
    (id: string) => {
      patchConversation(id, (c) => ({ ...c, neutralMarks: !c.neutralMarks }));
    },
    [patchConversation],
  );

  // ── Per-conversation un-redaction (reveal) ────────────────────────────────
  /** True when a redacted value's category is FORCED by the org — it can never be
   *  un-redacted (the reveal actions no-op and the UI shows a lock). */
  const isRevealForced = useCallback(
    (value: string): boolean => {
      const forced = orgProfileRef.current?.forcedCategories;
      if (!forced?.length) return false;
      const kind = active?.redactionKinds?.[value];
      const cat = kind ? redactionCategory(kind) : undefined;
      return !!cat && forced.includes(cat);
    },
    [active],
  );

  /** Un-redact a REAL value for THIS conversation. `suspend` keeps the vault
   *  mapping (reversible via {@link reRedact}); `delete` also drops the vault entry.
   *  Both add it to `revealedValues` so the NEXT send keeps it in clear. NO-OP +
   *  returns false when the category is org-forced. */
  const revealRedaction = useCallback(
    (value: string, mode: "suspend" | "delete"): boolean => {
      const id = activeId;
      if (!id || isRevealForced(value)) return false;
      patchConversation(id, (c) => {
        const revealed = new Set(c.revealedValues ?? []);
        revealed.add(value);
        let redactionVault = c.redactionVault;
        let redactionKinds = c.redactionKinds;
        if (mode === "delete") {
          const ph = redactionVault
            ? Object.entries(redactionVault).find(([, v]) => v === value)?.[0]
            : undefined;
          if (ph && redactionVault) {
            redactionVault = { ...redactionVault };
            delete redactionVault[ph];
          }
          if (redactionKinds && value in redactionKinds) {
            redactionKinds = { ...redactionKinds };
            delete redactionKinds[value];
          }
        }
        // Revealing a value also UN-FORCES it (the manual-redaction undo path), so
        // it isn't re-redacted on the next send by its forced entry.
        const forcedRedactions = (c.forcedRedactions ?? []).filter((f) => f.value !== value);
        return {
          ...c,
          revealedValues: [...revealed],
          forcedRedactions,
          redactionVault,
          redactionKinds,
          updatedAt: Date.now(),
        };
      });
      return true;
    },
    [activeId, patchConversation, isRevealForced],
  );

  /** Manually FORCE a value to be redacted for THIS conversation, AS `category`
   *  (composer text-selection → "Redact" → chosen type). Persists so every later
   *  message redacts it too; also drops it from `revealedValues` (the opposite). */
  const forceRedact = useCallback(
    (value: string, category: string, convId?: string) => {
      const id = convId ?? activeId;
      const v = value.trim();
      if (!id || !v) return;
      patchConversation(id, (c) => {
        const forced = (c.forcedRedactions ?? []).filter((f) => f.value !== v);
        forced.push({ value: v, category });
        return {
          ...c,
          forcedRedactions: forced,
          revealedValues: (c.revealedValues ?? []).filter((x) => x !== v),
          updatedAt: Date.now(),
        };
      });
    },
    [activeId, patchConversation],
  );

  /** Undo a manual redaction: stop forcing `value` in this conversation. */
  const unforceRedact = useCallback(
    (value: string, convId?: string) => {
      const id = convId ?? activeId;
      if (!id) return;
      patchConversation(id, (c) => ({
        ...c,
        forcedRedactions: (c.forcedRedactions ?? []).filter((f) => f.value !== value),
        updatedAt: Date.now(),
      }));
    },
    [activeId, patchConversation],
  );

  // ── The COFFRE: values ALWAYS redacted, across every conversation + model ──────────
  /** Add a value to the coffre (deduped case-insensitively). Returns the new/existing
   *  entry. Persisted in `Settings.coffre` (encrypted at rest via the DB, stripped from
   *  the plaintext localStorage copy) and merged HIGHEST-priority into every send's
   *  forced list. `token` = a canonical pseudonymize category (`NAME`/`ORG`/`IBAN`…). */
  const addVaultTerm = useCallback(
    (value: string, token: string, note?: string): VaultTerm | null => {
      const v = value.trim();
      if (!v) return null;
      let entry: VaultTerm | null = null;
      setSettings((s) => {
        const vaultTerms = s.coffre ?? [];
        const existing = vaultTerms.find((t) => t.value.trim().toLowerCase() === v.toLowerCase());
        if (existing) {
          entry = existing;
          return s;
        }
        entry = makeVaultTerm(v, token, note);
        return { ...s, coffre: [entry, ...vaultTerms] };
      });
      return entry;
    },
    [],
  );
  /** Remove a coffre entry by id. */
  const removeVaultTerm = useCallback((id: string) => {
    setSettings((s) => ({ ...s, coffre: (s.coffre ?? []).filter((t) => t.id !== id) }));
  }, []);
  /** Patch a coffre entry (e.g. change its type or note). */
  const updateVaultTerm = useCallback((id: string, patch: Partial<Omit<VaultTerm, "id">>) => {
    setSettings((s) => ({
      ...s,
      coffre: (s.coffre ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);
  /** True when a value is already in the coffre (case-insensitive) — for de-dup UI. */
  const vaultHas = useCallback(
    (value: string) => vaultHasValue(settings.coffre, value),
    [settings.coffre],
  );

  // ── The COMPÉTENCES: reusable prompts the user inserts into a chat ────────────────
  // Its CRUD lives in its own hook (this file is the repo's biggest and on the LOC
  // ratchet), over the SAME settings-field storage the coffre uses.
  const skillsApi = useSkills(settings, setSettings);
  const memoryApi = useMemoryStore(settings, setSettings);
  // The extractor call must ROUTE exactly like a normal send. A platform model
  // (Scaleway, or OpenRouter without a stored key) is proxied through the app's
  // gateway with a FRESH Supabase JWT — WITHOUT this, `host.complete` for the DEFAULT
  // keyless OpenRouter `:free` model reaches no endpoint (no key, no base URL), throws, and
  // the extraction silently no-ops — the « retiens que… » never persisted. Mirrors
  // sendMessage's platform-token block; `resolveEffectivePlatform` is the single routing
  // source (rule 9). Bare `host.complete` (no routing) was the bug.
  const memoryComplete = useCallback(
    async (payload: CompletePayload): Promise<string> => {
      if (!host.complete) throw new Error("complete host unavailable");
      // Only fetch a token when a platform route needs one (a fresh JWT per call).
      const platform = resolveEffectivePlatform(payload.provider, payload.model, settings.billingMode, keyConfigured);
      const token = platform
        ? ((host.auth?.getAccessToken ? await host.auth.getAccessToken().catch(() => null) : null) ??
          undefined)
        : undefined;
      // `completeRouting` throws when a platform route is required but the URL/token is
      // missing → caught in `runMemoryExtraction`, watermark left, retried later.
      const routing = completeRouting(payload.provider, payload.model, {
        billingMode: settings.billingMode,
        keyConfigured,
        inferenceUrl: host.inferenceUrl,
        token,
        openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
      });
      return host.complete({ ...payload, ...routing });
    },
    [host, settings.billingMode, settings.openaiCompatBaseUrl, keyConfigured],
  );
  // AUTOMATIC extraction (idle timer + switch-away flush). The runner reads the
  // conversation's WIRE slice — already-egressed fakes, zero new PII out — and merges
  // locally; `memory/extract.ts` owns every decision (tested there).
  // Context compaction: once a thread outgrows its window, the oldest turns are replaced
  // by a recap instead of vanishing (`send/contextSummary.ts`). Same out-of-band shape and
  // the same egress argument as the extraction below — it reads WIRE turns only.
  useContextCompaction({
    conversations,
    activeId,
    settings,
    complete: host.complete ? memoryComplete : undefined,
    patchConversation,
  });
  useMemoryExtraction({
    conversations,
    activeId,
    settings,
    complete: host.complete ? memoryComplete : undefined,
    setMemory: (fn) => setSettings((s) => ({ ...s, memoire: fn(s.memoire ?? { cards: [] }) })),
    patchConversation,
    // « retiens ça » feedback on the turn's assistant reply — the patch is
    // `pinMemoryNote` (beside the run that triggers it).
    noteOnMessage: (convId, count, createdIds, failed, updatedIds) =>
      patchConversation(convId, (c) => pinMemoryNote(c, count, createdIds, failed, updatedIds)),
    // Anything added to memory raises the rail's « nouveau » dot (cleared on visit).
    onMemoryFresh: () => reduxStore.dispatch(setMemoryFresh(true)),
  });

  /** Undo a "suspend": re-redact the value on the next send. */
  const reRedact = useCallback(
    (value: string) => {
      const id = activeId;
      if (!id) return;
      patchConversation(id, (c) => ({
        ...c,
        revealedValues: (c.revealedValues ?? []).filter((v) => v !== value),
        updatedAt: Date.now(),
      }));
    },
    [activeId, patchConversation],
  );

  const stop = useCallback((targetConvId?: string) => {
    // Cancel + finalize ONE conversation's turn, clearing its keys first so a
    // late transport event can't re-run it (finalize even if the transport won't
    // send a completion event after being cancelled).
    const runOne = (key: string) => {
      const cancel = cancelRef.current.get(key);
      const finish = finishRef.current.get(key);
      cancelRef.current.delete(key);
      finishRef.current.delete(key);
      cancel?.();
      finish?.();
    };
    // A split pane stops ITS OWN conversation (`targetConvId`); default = the focused
    // pane's conversation. Only fall back to halting everything when the caller had no
    // specific target AND the focused tab isn't the generating one.
    const id = targetConvId ?? activeIdRef.current;
    if (id && (cancelRef.current.has(id) || finishRef.current.has(id))) {
      runOne(id); // stop the conversation the user is watching
      return;
    }
    if (targetConvId) return; // an explicit target that isn't generating → nothing to do
    // Fallback: the active tab isn't the one generating (isStreaming is a global
    // flag), so don't leave the Stop button dead — halt every in-flight turn.
    for (const key of new Set([...cancelRef.current.keys(), ...finishRef.current.keys()])) {
      runOne(key);
    }
  }, []);

  // READ-ONLY live PII detection for the composer's live preview. Runs the SAME
  // engine as the send (patterns / local NER / model / remote) so names & orgs
  // highlight live too, but is deliberately NON-DESTRUCTIVE: it detects against a
  // THROWAWAY vault (never the conversation's), and does NOT touch the debug or
  // analytics pipelines (it fires on a debounce as the user types). Best-effort —
  // returns `matches` (verbatim value + fine category) to highlight; on ANY failure
  // returns `[]` + an `error` (the composer keeps its instant regex layer). This is
  // ONLY a preview: the actual privacy guarantee stays in `sendMessage`, which
  // re-runs redaction and FAIL-CLOSES before anything leaves the machine — so a
  // failed/stale preview can never let un-redacted data through. Stable identity
  // (reads volatile state via refs) so the composer's debounce effect doesn't churn.
  const detectPii = useCallback(
    async (
      text: string,
      signal?: AbortSignal,
      // Which conversation's rules the preview must reflect — the CALLER'S pane, not
      // the store's global `activeId`. In the split workspace each pane resolves its
      // own conversation independently; a preview that fell back to `activeId` showed
      // a NON-focused pane the rules of whichever tab was last clicked elsewhere —
      // misleading, though never a leak (the send itself always re-resolves its own
      // conversation). Optional so a caller with no pane context keeps today's
      // behaviour (the globally active conversation).
      convId?: string | null,
    ): Promise<{
      matches: { value: string; category: string; uncertain?: boolean }[];
      engine: Settings["redactEngine"];
      error?: string;
    }> => {
      const settings = settingsRef.current;
      const host = hostRef.current;
      const engine = settings.redactEngine;
      const throwIfAborted = () => {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      };
      if (!text.trim()) return { matches: [], engine };

      // `redactEngine` can here only be "local" or "patterns": `normalizeSettings`
      // coerces the old "remote"/"model" engines to "local" on every load (the
      // selectors were removed from the product, and an old blob must not keep
      // sending detection off the machine). The remote branches are PURGED —
      // do not reintroduce them here: the remote engine that lives on is the gateway's,
      // consumed by other surfaces (audit 2026-08-10).
      const useLocal = engine === "local" && !!host.detectLocalPii;
      const useAiDetect = useLocal;

      // Effective categories (global ⊕ conversation override ⊕ org-forced ⊕ retired off),
      // from the SAME function the send calls — so the preview highlights exactly what
      // will be redacted. It used to re-spell the merge inline here, which silently
      // dropped the RETIRED categories the shared version forces off last.
      const conv = conversationsRef.current.find((c) => c.id === (convId ?? activeIdRef.current));
      const effectivePreviewCategories = effectiveRedactCategories(
        settings.redactCategories,
        conv?.redactCategories,
        orgProfileRef.current?.forcedCategories,
      );
      const disabledKinds = disabledKindsOf(effectivePreviewCategories);
      // Same notoriety exemption as the send (derived from the level) — without it, the
      // preview would highlight a brand or a public figure that the send will leave in clear.
      const { commercial: commercialNotoriety, people: peopleNotoriety } = notorietyForLevel(
        levelOf(effectivePreviewCategories, orgProfileRef.current?.forcedCategories),
      );
      // Connected-integration names (Stripe, Canva…) are never flagged, like the
      // send. Read the CACHED list (refreshed on connect/disconnect) — never re-query
      // the MCP servers here: this runs per keystroke and would stall the composer.
      const keep = keepListRef.current;

      // Lightweight detect fn — NO debug/analytics logging (this runs per debounce).
      const detectLocalFn =
        useLocal && host.detectLocalPii
          ? (t: string) => host.detectLocalPii!({ text: t })
          : undefined;

      try {
        const res = await pseudonymize(text, {
          vault: {},
          numbers: useAiDetect ? redactNumbersOn(settings) : false,
          detectLocal: detectLocalFn,
          disabledKinds,
          keep,
          commercialNotoriety,
          peopleNotoriety,
        });
        throwIfAborted();
        return {
          matches: (res.matches as RedactionMatch[]).map((m) => ({
            value: m.value,
            category: redactionCategory(m.category ?? m.type), uncertain: m.uncertain,
          })),
          engine,
        };
      } catch (e) {
        if (signal?.aborted) throw e; // let the composer drop a superseded call
        return { matches: [], engine, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [],
  );

  // The ORCHESTRATION lives in send/sendOrchestrator.ts (the plan from state/CLAUDE.md:
  // « must move as a WHOLE »). The capture bag is built HERE, inside the useCallback,
  // with the SAME dependencies: the values seen by the send are those of the render that
  // (re)created the callback — closure semantics unchanged. `conversations` stays a
  // dependency without entering the bag: it only serves to RE-CREATE the callback.
  const sendMessage = useCallback(
    (...args: Parameters<ReturnType<typeof createSendMessage>>) =>
      createSendMessage({
        t,
        host,
        settings,
        activeId,
        keyConfigured,
        patchConversation,
        createConversation,
        forceRedact,
        setIsStreaming,
        setBrowserActivity,
        conversationsRef,
        cancelRef,
        finishRef,
        resumeTranscriptsRef,
        orgProfileRef,
        personalSubRef,
        personalCreditsRef,
        keepListRef,
        localEndpointReachableRef,
        claudeCliReadyRef,
        codexCliReadyRef,
        antigravityCliReadyRef,
      })(...args),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the HISTORICAL list,
    // kept identical: it governs WHEN the send re-captures, not what
    // it reads (refs and setters are stable, the body is in send/).
    [host, activeId, conversations, settings, keyConfigured, createConversation, patchConversation],
  );

  // Always-fresh sendMessage, so `regenerate` calls the version bound to the
  // LATEST conversations (after it removes the failed turn) — not a stale closure.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  /**
   * Retry a FAILED assistant turn IN PLACE: drop the errored assistant AND its
   * preceding user message, then re-send the user's original text AND its attached
   * documents. Removing the pair first is exactly what stops the same message from
   * being sent twice (the old retry left the failed user turn in place and appended
   * a fresh one).
   *
   * A message only persists its attachments' METADATA (name/kind/mime), not their
   * bytes — so the failed turn's document is rebuilt from the LIBRARY (files are
   * stored per-conversation on the first send) by name, then re-sent as a normal
   * attachment. Without this, a stop-then-retry re-sent only the text and the
   * document silently vanished. (An image-mode doc replays as text-fold — its
   * content still reaches the model, reversibly via the vault.)
   *
   * The library round-trip is best-effort: it FAILS to recover the document text when
   * the file was never stored (redaction off), there's no Host DB, extraction fails,
   * or the stored name doesn't match — and then the document dropped out of the retry
   * (the reported bug). So when the rebuilt files carry no text, we FALL BACK to the
   * turn's persisted `modelContent` (typed text + folded document), re-sent verbatim as
   * the wire via `opts.resendWire` — the same reliable source a normal follow-up turn
   * re-includes at the history-build step.
   */
  const regenerate = useCallback(
    async (assistantId: string, targetConvId?: string) => {
      // A split pane retries in ITS OWN conversation; default to the focused one.
      const convId = targetConvId ?? activeId;
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) return;
      const idx = conv.messages.findIndex((m) => m.id === assistantId);
      if (idx < 1) return;
      const user = conv.messages[idx - 1];
      if (user.role !== "user") return;
      const text = user.content;
      const attachMeta = user.attachments ?? [];
      patchConversation(convId!, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== assistantId && m.id !== user.id),
      }));
      // Rebuild the attached documents from the library so the retried turn keeps
      // its files. Match the failed turn's attachment names to stored file rows.
      let files: ExtractedFile[] | undefined;
      if (attachMeta.length && host.db?.listFiles && host.db?.loadFile) {
        try {
          const names = new Set(attachMeta.map((a) => a.name));
          const metas = (await host.db.listFiles(convId!)).filter((m) => names.has(m.name));
          const loaded = await Promise.all(
            metas.map((m) =>
              loadReattachFile(host, {
                id: m.id,
                name: m.name,
                mime: m.mime,
              }).catch(() => null),
            ),
          );
          const ok = loaded.filter((f): f is ExtractedFile => f !== null);
          if (ok.length) files = ok;
        } catch {
          /* library unavailable → fall back to a text-only retry */
        }
      }
      // Did the library round-trip actually recover the document TEXT? If not — the
      // file was never stored (redaction off), the DB is absent, extraction failed, or
      // the name didn't match — the folded document would silently vanish (the reported
      // "le texte du document n'a pas été re-envoyé au retry"). The original folded
      // payload is ALSO persisted on the failed user turn as `modelContent` (typed text
      // + document, incl. any plot directive), so fall back to re-sending THAT verbatim
      // as the wire — reliable, vault-reversible, and identical to a normal follow-up
      // turn. Pass no files then (their text is already in `resendWire` → no double-fold).
      const resendWire = retryResendWire(text, user.modelContent, files);
      // Let the removal flush to state, then call the fresh sendMessage (via ref)
      // so the resent turn's history excludes the failed one. Re-thread the "Graphique"
      // tag so a plot retry re-forces the interpreter (the directive rides `modelContent`).
      // With a `resendWire` the compétence rides for its TAG only — the
      // instruction is already inside it, re-prefixing would duplicate it. WITHOUT one
      // (the payload was not recoverable), `retryTagPrompt` re-supplies the prompt —
      // snapshot first, else today's version — so the retry never sends the bare text.
      // ⚠️ `competence ?? workflow`: replaying an OLD turn, sent back when there were two
      // lists, must go out again with its instruction — not as bare text.
      const tag = user.competence ?? user.workflow;
      const compPromptRetry = tag
        ? retryTagPrompt(
            resendWire,
            tag.prompt,
            settings.competences?.find((c) => c.id === tag.id)?.prompt,
          )
        : undefined;
      // The « Demander » target: its "today's version" is recomputed from the tag
      // itself — the line derives from kind/name/path/source, nothing else to look up.
      const atPromptRetry = user.askTarget
        ? retryTagPrompt(resendWire, user.askTarget.prompt, askTargetLaunchText(user.askTarget))
        : undefined;
      setTimeout(
        () =>
          void sendMessageRef.current(text, resendWire ? undefined : files, {
            plotTag: user.plotTag,
            ...(tag
              ? {
                  competence: {
                    id: tag.id,
                    name: tag.name,
                    prompt: compPromptRetry,
                    servers: tag.servers,
                  },
                }
              : {}),
            ...(user.askTarget
              ? { askTarget: { ...user.askTarget, prompt: atPromptRetry } }
              : {}),
            ...(resendWire ? { resendWire } : {}),
            // Reuse the failed turn's id so write-idempotency keys match — an action that
            // already succeeded before the failure is recognised and not repeated.
            ...(user.turnId ? { resendTurnId: user.turnId } : {}),
          }),
        0,
      );
    },
    [activeId, conversations, patchConversation, host, settings.competences],
  );

  return {
    settings,
    setSettings,
    keyConfigured,
    setApiKey,
    clearApiKey,
    // Re-read WHICH ids hold a key (never a value). Exposed because a key can now be
    // minted OUTSIDE this store: the OpenRouter PKCE flow stores it in main, so nothing
    // here would otherwise know the set changed.
    refreshKeys,
    /** The signed-in member's org authorization, or null for a solo user. Powers
     *  the account org section, model-picker filtering, and the redaction locks. */
    orgProfile,
    /** The individual account's prepaid credit budget this period (null = unknown /
     *  no billing host). Fetched eagerly on mount + auth change — NOT the lazy
     *  Settings-scoped cache — so a credit-blocked turn can show the REAL figures
     *  even if the user never opened Réglages. */
    personalCredits,
    /** The individual account's subscription (null = unknown → treated as free).
     *  `currentPeriodEnd` is the credits' reset date, when Stripe knows one. */
    personalSub,
    /** Model id → why it can't send (missing key / exhausted credits / no self-hosted
     *  endpoint). The pickers grey these out; the send gate refuses them for the SAME
     *  reason (`send/modelAvailability.ts`). */
    unavailableModels,
    // For Réglages → Modèles: the Claude Code CLI detection state (the opt-in
    // `claudeCliEnabled` setting lives in `settings` like the others).
    claudeCliDetected,
    codexCliDetected,
    antigravityCliDetected,
    conversations,
    /** True once the initial per-account load has settled (see the `loaded` state). */
    loaded,
    /** Gates the SYNC channels — `dbWipeGuard.ts`: FALSE when the DB load has
     *  failed (loaded stays true for the UI; sync, though, must stay closed). */
    syncReady: isSyncReady(loaded, !!host.db, dbActive.current),
    active,
    activeId,
    setActiveId,
    /** Pending "scroll to this message" request (from the audit page). */
    scrollTarget,
    /** Activate a conversation + request a scroll to one of its messages. */
    openConversationAt,
    /** Clear the scroll request once the chat view has honoured it. */
    clearScrollTarget,
    isStreaming,
    /** Bumped each time the agent starts a browser tool call — the shell watches it
     *  to auto-open the split browser panel while the model drives the browser. */
    browserActivity,
    createConversation,
    forkConversation,
    importConversations,
    deleteConversation,
    renameConversation,
    /** Read/write a conversation's UNSENT composer draft (in-memory, per-conversation
     *  — survives navigation + tab switch, cleared on send). */
    getDraft,
    getStagedAttachments,
    setStagedAttachments,
    setDraft,
    setModel,
    editDocument,
    mergeVaultInto,
    /** Record-sync merge/remove (see the callback above) — sync-layer only. */
    applySyncedConversation,
    setConversationCategories,
    setConversationMemoryOff,
    toggleConversationNeutralMarks,
    revealRedaction,
    reRedact,
    forceRedact,
    unforceRedact,
    isRevealForced,
    /** The COFFRE — values ALWAYS redacted across every conversation + model. */
    addVaultTerm,
    removeVaultTerm,
    updateVaultTerm,
    vaultHas,
    /** The COMPÉTENCES — reusable prompts the user inserts into a chat
     *  (`state/useCompetences.ts`). Spread so callers read `chat.competences`,
     *  `chat.addCompetence`, … flat, like every other store member. */
    ...skillsApi,
    /** The MÉMOIRE — cross-conversation durable facts (`state/useMemory.ts`). */
    ...memoryApi,
    sendMessage,
    /** Read-only live PII detection for the composer preview (never mutates the
     *  vault; the send re-redacts + fail-closes — this is display only). */
    detectPii,
    regenerate,
    stop,
  };
}

export type ChatStore = ReturnType<typeof useChatStore>;
