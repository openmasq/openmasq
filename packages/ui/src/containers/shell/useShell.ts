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
    /** Le chapitre demandé à l'ouverture (sinon le premier). Vit ici et non dans la
     *  modale : c'est l'APPELANT qui sait pourquoi il ouvre. */
    chapter?: string;
    openChapter: (id: string) => void;
  };
  /** Une mise à jour TÉLÉCHARGÉE qui attend un redémarrage — l'annonce et son geste
   *  (`shell/hooks/useUpdateReady.ts`). Shell-level pour la même raison que le guide :
   *  elle arrive quel que soit l'écran, et le rail droit doit pouvoir la rouvrir. */
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
  /** « Demander » depuis le navigateur : amorcer une question SUR la page ouverte. */
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

  // Une réponse qui arrive pendant qu'on regarde ailleurs se signale au SYSTÈME, et le
  // clic ramène ici. Monté dans la coquille et pas dans le store parce qu'ouvrir un fil,
  // c'est aussi revenir à la section « chats » — ce que seule la nav sait faire.
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
   * « Demander » depuis le bandeau du navigateur — le pendant de `askAboutTarget` pour la
   * page ouverte.
   *
   * ⚠️ Il écrit dans la conversation COURANTE, là où le dossier en ouvre une neuve. Le
   * navigateur vit dans l'écran scindé, À CÔTÉ d'une conversation : en créer une autre
   * remplacerait le contexte que l'utilisateur regarde justement pendant qu'il pose sa
   * question. Une conversation n'est créée que s'il n'y en a aucune.
   *
   * Le TEXTE arrive déjà rédigé (`BrowserPanel` → `askPageDraft`, pur et testé) : la
   * page possède sa vocabulaire, ce niveau-ci ne possède que la conversation — un
   * `containers/` n'importe pas dans `pages/`. Le panneau reste ouvert : le geste est
   * « à propos de CE que je regarde ».
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
      // Ouvrir SANS chapitre efface le précédent : le guide ne doit pas rouvrir sur le
      // chapitre d'un autre geste.
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
