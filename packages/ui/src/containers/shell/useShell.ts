import { useEffect, useState } from "react";
import type { ChatStore } from "../../state/store";
import type { Host } from "../../host";
import { useHost } from "../../host";
import { openTab, track, useAppDispatch, useAppSelector, type Section } from "../../state/redux";
import { useSectionNav } from "./useSectionNav";
import { useReplyNotice } from "../../state/effects/useReplyNotice";
import { useAuth } from "../../state/useAuth";
import { accountDisplayName, firstNameOf } from "./accountName";
import { useMcpReconnect } from "../../hooks/useMcpReconnect";
import { useOpenRouterModels } from "../../hooks/useOpenRouterModels";
import { useWorkspaceSync } from "../../hooks/useWorkspaceSync";
import { useReturnAfterConnect } from "../../hooks/useReturnAfterConnect";
import { useShellDeepLinks, type ShellDeepLinks } from "./hooks/useShellDeepLinks";
import { useConvActions, type ConvActions } from "./hooks/useConvActions";
import { useStagedIntents, type StagedIntents } from "./hooks/useStagedIntents";
import { useRightPane, type RightPane } from "./hooks/useRightPane";
import { useSearchPalette } from "./hooks/useSearchPalette";
import { useAvis } from "./hooks/useAvis";
import { useUpdateReady, type UpdateReadyApi } from "./hooks/useUpdateReady";
import { useSplitRatio } from "./hooks/useSplitRatio";
import type { WorkspaceLayout } from "../../workspace/layout";

/** Floor for the launch intro, in ms.
 *
 *  DERIVED, not chosen by feel: the intro fades in over 0.4 s, then staggers its six rail
 *  icons at 0.12 s each (`AppIntro`) — the composition is only fully on screen at ~1.1 s.
 *  At the previous 700 ms the splash left BEFORE it had finished arriving, which reads as
 *  a flicker rather than a beat. 1.2 s is the first value that shows the whole thing.
 *
 *  Deliberately NOT the 1.8 s of the mark's full pulse (nor the 3 s of the redaction grid
 *  forming): this floor is paid on EVERY launch of an app opened many times a day, so it
 *  buys "you saw it", not "you watched it". `splashVisible` is the decision; this is only
 *  its floor. */
export const MIN_SPLASH_MS = 1200;

/** Is the launch takeover on screen? Pure, so the rule is testable without a renderer:
 *  no account gate ⇒ never; otherwise while the session is resolving OR until the floor
 *  above has elapsed — whichever ends LAST, so a session that resolves instantly (the
 *  common case, seeded from disk) still gets a visible beat. */
export function splashVisible(p: {
  authEnabled: boolean;
  authLoading: boolean;
  minDone: boolean;
}): boolean {
  return p.authEnabled && (p.authLoading || !p.minDone);
}

/**
 * Everything the app shell knows and can do — with **no JSX**. Both presentations
 * (`DesktopShell`, `mobile/MobileShell`) call this and render the same values their own
 * way, which is the whole point: a phone differs in navigation and screen composition,
 * never in what the app can do. Anything platform-shaped that leaks in here is a bug —
 * the one seam is `onEnterConversation` (see `useConvActions`).
 */
export type ShellApi = {
  chat: ChatStore;
  host: Host;
  section: Section;
  go: (s: Section) => void;
  /** A login / onboarding modal owns the screen; the shell renders inert behind it. */
  overlay: "login" | "onboarding" | null;
  /** The session is still resolving — render the AppIntro takeover instead of the shell. */
  splash: boolean;
  /** Session lost but kept (offline-tolerant) → the reconnecting banner. */
  reconnecting: boolean;
  /** Initials source for the rail / sidebar avatar; "Vous" when signed out. */
  userName: string;
  /** First name for the home greeting; undefined ⇒ a plain time-of-day greeting. */
  greetingName: string | undefined;
  /** « Aide » — the in-app guide (`containers/modals/GuideModal.tsx`). Shell-level, like
   *  the avis and ⌘K modals, so every navigation surface can open the one guide. */
  guide: {
    open: boolean;
    setOpen: (v: boolean) => void;
    /** The chapter requested on open (else the first one). Lives here and not in the
     *  modal: it's the CALLER who knows why it's opening. */
    chapter?: string;
    openChapter: (id: string) => void;
  };
  /** A DOWNLOADED update waiting for a restart — the announcement and its gesture
   *  (`shell/hooks/useUpdateReady.ts`). Shell-level for the same reason as the guide:
   *  it arrives regardless of the screen, and the right rail must be able to reopen it. */
  update: UpdateReadyApi;
  mcpReconnect: ReturnType<typeof useMcpReconnect>;
  /** The tiling workspace layout — a pane resolves its own tab strip against it. */
  layout: WorkspaceLayout;
  deep: ShellDeepLinks;
  conv: ConvActions;
  pane: RightPane;
  search: ReturnType<typeof useSearchPalette>;
  avis: ReturnType<typeof useAvis>;
  split: ReturnType<typeof useSplitRatio>;
  /** « Demander » from the browser: prime a question ABOUT the open page. */
  askAboutPage: (draft: string) => void;
} & StagedIntents;
// ^ The staging concerns (pending attach/compétence/workflow/« Demander » target,
//   stage*/attachFile/reattach/askAboutTarget) live — types AND docs — in
//   `hooks/useStagedIntents.ts` (rule 1: this aggregator sat at the 300-LOC cap).

export function useShell({
  chat,
  onEnterConversation,
}: {
  chat: ChatStore;
  /** Called when the user lands ON a conversation — the mobile push (see ConvActions). */
  onEnterConversation?: () => void;
}): ShellApi {
  const dispatch = useAppDispatch();
  const host = useHost();
  const { section, go } = useSectionNav();
  const mcpReconnect = useMcpReconnect();
  // Fold OpenRouter's LIVE catalogue over the static registry once on mount (its internal
  // state bump re-renders the shell so the pickers pick up the new models).
  useOpenRouterModels();

  const deep = useShellDeepLinks({ chat, section, go });
  const conv = useConvActions({ chat, go, onEnterConversation });
  const pane = useRightPane({ chat, section });
  const avis = useAvis({ chat, section });
  const split = useSplitRatio();

  // A reply arriving while looking elsewhere signals to the SYSTEM, and the
  // click brings you back here. Mounted in the shell and not in the store because opening a thread
  // also means returning to the "chats" section — which only the nav knows how to do.
  useReplyNotice({
    conversations: chat.conversations,
    activeId: chat.activeId,
    settings: chat.settings,
    host,
    onOpen: conv.selectConversation,
  });

  // Once the connector the user went to Réglages to connect is connected, jump back to the
  // conversation that asked for it (one-shot, only while still on Settings).
  useReturnAfterConnect({
    connectorId: deep.settingsTab?.connectorId,
    returnToConvId: deep.settingsTab?.returnToConvId,
    connectedIds: deep.connectedIds,
    section,
    onReturn: conv.selectConversation,
    onDone: deep.clearReturnTo,
  });

  // The composer staging concerns (attach / compétence / workflow / « Demander »
  // target) — their own hook, consumed once by ChatView via `pending`.
  const staged = useStagedIntents({ chat, go });
  /**
   * « Demander » from the browser bar — the counterpart of `askAboutTarget` for the
   * open page.
   *
   * ⚠️ It writes into the CURRENT conversation, whereas the folder version opens a new one. The
   * browser lives in the split screen, BESIDE a conversation: creating another one
   * would replace the context the user is precisely looking at while asking their
   * question. A conversation is only created if there is none.
   *
   * The TEXT arrives already drafted (`BrowserPanel` → `askPageDraft`, pure and tested): the
   * page owns its vocabulary, this level owns only the conversation — a
   * `containers/` doesn't import into `pages/`. The panel stays open: the gesture is
   * "about WHAT I'm looking at".
   */
  const askAboutPage = (draft: string) => {
    const existing = chat.activeId;
    const convId = existing ?? chat.createConversation();
    if (!existing) dispatch(openTab(convId));
    chat.setDraft(convId, draft);
    go("chats");
  };

  const [guideOpen, setGuideOpen] = useState(false);
  const [guideChapter, setGuideChapter] = useState<string | undefined>(undefined);
  const update = useUpdateReady();

  const auth = useAuth();
  // Minimum on-screen time for the AppIntro shimmer, so it PLAYS a visible beat rather
  // than blinking out the instant the session resolves (now near-instant: the auth gate
  // settles from the on-disk seed without waiting on the network).
  // A BEAT, not a wait: this floor applies to EVERY launch of a desktop app opened many
  // times a day, and the session it was covering no longer takes seconds to resolve.
  const [minSplashDone, setMinSplashDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // Login + first-run onboarding are MODALS floating OVER the app (blurred, inert
  // behind) — the shell is always rendered. Precedence: login → onboarding → app.
  // Computed here (not just at render) so the ⌘K handler can suppress the palette while
  // an overlay owns the screen.
  const overlay: "login" | "onboarding" | null =
    auth.enabled && !auth.user ? "login" : !chat.settings.onboarded ? "onboarding" : null;
  const search = useSearchPalette({ chat, blocked: !!overlay });

  // Keep the workspace layout ⇄ store activeId + the open tabs consistent (prune,
  // one-directional mirror, cold-start seed).
  const layout = useAppSelector((s) => s.ui.layout);
  const openTabIds = useAppSelector((s) => s.ui.openTabIds);
  useWorkspaceSync(chat, layout, openTabIds, dispatch);

  // One app_open event per launch (privacy-safe; sent only if opted in).
  useEffect(() => {
    dispatch(track({ name: "app_open" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    chat,
    host,
    section,
    go,
    overlay,
    splash: splashVisible({ authEnabled: auth.enabled, authLoading: auth.loading, minDone: minSplashDone }),
    reconnecting: !!(auth.reconnecting && auth.user),
    userName: accountDisplayName(auth.user?.email),
    greetingName: firstNameOf(auth.user),
    guide: {
      open: guideOpen,
      // Opening WITHOUT a chapter clears the previous one: the guide must not reopen on the
      // chapter of a different gesture.
      setOpen: (v: boolean) => {
        if (v) setGuideChapter(undefined);
        setGuideOpen(v);
      },
      chapter: guideChapter,
      openChapter: (id: string) => {
        setGuideChapter(id);
        setGuideOpen(true);
      },
    },
    update,
    mcpReconnect,
    layout,
    deep,
    conv,
    pane,
    search,
    avis,
    split,
    ...staged,
    askAboutPage,
  };
}
