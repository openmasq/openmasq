import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { panelOpenFile, useAppDispatch } from "../../state/redux";
import { SkillOpenProvider } from "../../skills/skillOpen";
import { MemoryUiProvider } from "../../memory/memoryUi";
import { LinkOpenProvider } from "../providers/linkOpen";
import { FileOpenProvider } from "../providers/fileOpen";
import { makeConnectOpenRouter } from "../../state/auth/connectOpenRouter";
import { FeedbackOpenProvider } from "../providers/feedbackOpen";
import { useOpenConnector } from "../providers/connectors";
import { needsAccessNotice } from "../../state/auth/accessNotice";
import { hasEstablishedAccount } from "../../state/auth/establishedAccount";
import { FeedbackModal, GuideModal, SearchModal, UpdateReadyModal } from "../modals";
import { StatusChip } from "../../components/feedback/StatusChip";
import { pickShellNotice, type ShellNoticeKind } from "./shellNotice";
import { TooltipLayer } from "../../components/brand/TooltipLayer";
import { AnalyticsNotice } from "../../components/AnalyticsNotice";
import { Onboarding } from "../../pages/Onboarding/Onboarding";
import { LoginScreen } from "../../pages/Login";
import { AppIntro } from "../../components/media/BrandLogo";
import { useHost } from "../../host";
import type { ShellApi } from "./useShell";
import { useT } from "../../i18n";

/**
 * The account gate's full-screen takeover (`ShellApi.splash`): resolve the session before
 * showing anything, since a blank/partial shell during the resolve would flash.
 *
 * This is the SINGLE in-app loader — the pre-React boot splash (`index.html`) paints
 * instantly and hands off to it on React's first frame, so the two read as one continuous
 * loader. `onDone` is a no-op because the gate (not the intro's own pulse timer) owns when
 * it clears.
 */
export function ShellSplash() {
  return (
    <div className="app app-loading">
      <AppIntro onDone={() => {}} />
    </div>
  );
}

/**
 * Everything that surrounds a shell and is IDENTICAL on every platform: the context
 * providers the whole tree reads, the app's status chip, the shell-level modals (avis,
 * ⌘K palette), the login / onboarding overlays and the analytics notice.
 *
 * Login and onboarding float OVER the app (blurred, inert behind) rather than replacing
 * it — the shell is always rendered. The slots keep the DOM order the CSS expects:
 * status dock → `nav` → modals → the section `children` → `footer` (the desktop right
 * rail, the mobile tab bar).
 */
export function ShellChrome({
  shell,
  className,
  nav,
  footer,
  children,
}: {
  shell: ShellApi;
  /** Extra classes on the `.app` frame (e.g. the mobile variant's `app-mobile`). */
  className?: string;
  nav?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const host = useHost();
  const { chat, overlay, feedback, search, deep, conv, mcpReconnect } = shell;
  const openConnector = useOpenConnector();
  // Closed for the session: the condition itself only disappears by adding access.
  const [accessSeen, setAccessSeen] = useState(false);
  const showAccess =
    !accessSeen &&
    needsAccessNotice({
      keyConfigured: chat.keyConfigured,
      personalSub: chat.personalSub,
      personalCredits: chat.personalCredits,
      orgProfile: chat.orgProfile,
      hasBilling: !!host.billing,
    });
  /* An ALREADY ESTABLISHED account (paid subscription loaded, or member of an organization)
     opening a NEW device does not go back through onboarding: `onboarded` is local to the
     machine (never synced), so without this a subscriber would fall back to the
     full pipeline — including the "Abonnement, ou votre clé" step — on every new machine.
     The decision (and why `null` = unknown ⇒ we don't skip, and why we don't touch
     `billingMode`) lives in `state/establishedAccount.ts`. If billing arrives
     while onboarding is on screen, it closes: that's the point. */
  const established = hasEstablishedAccount({
    personalSub: chat.personalSub,
    orgProfile: chat.orgProfile,
  });
  const onboarded = !!chat.settings.onboarded;
  useEffect(() => {
    if (!established || onboarded) return;
    chat.setSettings({ ...chat.settings, onboarded: true });
    // `chat` changes identity on every render; the guard above makes the effect idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [established, onboarded]);

  const notice = pickShellNotice(
    { reconnecting: shell.reconnecting, mcpItems: mcpReconnect.items, showAccess },
    t,
  );
  const runNoticeAction = (kind: ShellNoticeKind) => {
    if (kind === "access") return deep.openSettings("models");
    if (kind !== "mcp") return;
    // Reconnect right where you are: the chip opens the connector's modal over
    // the current screen, no detour through Réglages (falls back there if nothing mounts it).
    const id = mcpReconnect.items[0]?.id;
    if (!id) return;
    if (openConnector) openConnector(id);
    else deep.openSettings("mcp", id);
  };
  const dismissNotice = (kind: ShellNoticeKind) => {
    if (kind === "mcp") mcpReconnect.dismiss();
    if (kind === "access") setAccessSeen(true);
  };

  /* `aria-hidden` SAYS the background is out of play; `inert` MAKES it true — without it, the
     first tab from the login or onboarding modal lands BEHIND it
     (measured: on the rail's logo). Set via a ref: `inert` isn't a property
     known to this version of React. */
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = appRef.current;
    if (!el) return;
    el.inert = !!overlay;
    return () => {
      el.inert = false;
    };
  }, [overlay]);

  return (
    <SkillOpenProvider value={deep.openSkillById}>
              <MemoryUiProvider value={deep.memoryUiApi}>
          <LinkOpenProvider value={shell.pane.linkOpenApi}>
            <FileOpenProvider value={shell.pane.fileOpenApi}>
            <FeedbackOpenProvider value={feedback.api}>
              {/* One delegated listener for every `title` in the app — mounted HERE, on
                  the surround both platforms share, so a control labelled on one is
                  labelled on the other. It renders nothing until something is hovered. */}
              <TooltipLayer />
              <div
                ref={appRef}
                className={`${overlay ? "app app-behind" : "app"}${className ? ` ${className}` : ""}`}
                aria-hidden={overlay ? true : undefined}
              >
                {/* The app's PERMANENT states — auth server unreachable (we KEEP
                    the session open instead of sending back to login), a remote connector
                    that dropped, neither subscription nor key. One at a time, chosen by
                    `pickShellNotice`, and rendered as a CHIP: three full-width bars
                    used to take turns above the composer and hog the whole bottom of
                    the screen for a sentence already read. The title is enough; the message and
                    the action are one click away. Each falls silent on its own — the failure when
                    it's fixed, the information when it's closed. */}
                <div className="kchip-dock" role="status" aria-live="polite">
                  {notice && (
                    <StatusChip
                      key={notice.kind}
                      tone={notice.tone}
                      title={notice.title}
                      message={notice.message}
                      action={
                        notice.actionLabel
                          ? { label: notice.actionLabel, onClick: () => runNoticeAction(notice.kind) }
                          : undefined
                      }
                      onClose={
                        notice.dismissible ? () => dismissNotice(notice.kind) : undefined
                      }
                    />
                  )}
                  {/* The first-launch analytics notice — a chip in the same dock, SERIALIZED
                      after login/onboarding: it used to be a card outside the overlay stack
                      that showed half-hidden under the modal, its « Compris » dead on click.
                      One decision at a time. */}
                  {!overlay && <AnalyticsNotice settings={chat.settings} onChange={chat.setSettings} />}
                </div>
                {nav}
                <AnimatePresence>
                  {feedback.open && (
                    <FeedbackModal
                      onClose={() => feedback.setOpen(null)}
                      // What identifies the build and the moment — never conversation
                      // content. Assembled in `useAvis`, gated by `buildFeedback`.
                      context={feedback.context}
                      prefill={feedback.open.prefill}
                      convId={chat.activeId}
                    />
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {shell.guide.open && (
                    <GuideModal
                      initialChapter={shell.guide.chapter}
                      onClose={() => shell.guide.setOpen(false)}
                    />
                  )}
                </AnimatePresence>
                {/* ⚠️ Never over login or onboarding: the update waits,
                    and being announced a version before even getting in makes no
                    sense. It isn't lost for that — the right rail reopens it. */}
                <AnimatePresence>
                  {!overlay && shell.update.open && shell.update.version && (
                    <UpdateReadyModal
                      version={shell.update.version}
                      note={shell.update.note}
                      onClose={() => shell.update.setOpen(false)}
                      onInstall={shell.update.install}
                    />
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {search.open && (
                    <SearchModal
                      conversations={chat.conversations}
                      onPick={(id) => {
                        conv.selectConversation(id);
                        search.setOpen(false);
                      }}
                      onNew={() => {
                        conv.newChat();
                        search.setOpen(false);
                      }}
                      onClose={() => search.setOpen(false)}
                      settingsResults={search.settingsResults}
                      onOpenSettings={deep.openSettings}
                      sectionResults={search.sectionResults}
                      onGoSection={(id) => {
                        if (id === "guide") shell.guide.setOpen(true);
                        else shell.go(id);
                      }}
                      fileResults={search.fileResults}
                      onOpenFile={(f) => {
                        // Open in the shared side panel and land on chats, where that
                        // panel is visible beside the conversation.
                        dispatch(
                          panelOpenFile({
                            id: f.id,
                            name: f.name,
                            mime: f.mime,
                            convId: f.conversationId,
                          }),
                        );
                        shell.go("chats");
                      }}
                    />
                  )}
                </AnimatePresence>
                {children}
                {footer}
              </div>
              <AnimatePresence>
                {overlay === "login" && <LoginScreen key="login" />}
                {overlay === "onboarding" && (
                  <Onboarding
                    key="onboarding"
                    settings={chat.settings}
                    onChange={chat.setSettings}
                    onDone={() => chat.setSettings({ ...chat.settings, onboarded: true })}
                    // No keychain (preview) ⇒ no key form: a "saved" that stored
                    // nothing would be a lie, so the affordance is withheld instead.
                    onSaveKey={host.keys ? chat.setApiKey : undefined}
                    // Absent on a platform without the flow (preview, mobile) ⇒ the
                    // connect button is not drawn and the paste path stays the only one.
                    onConnectOpenRouter={makeConnectOpenRouter(host, chat.refreshKeys)}
                    keyConfigured={chat.keyConfigured}
                  />
                )}
              </AnimatePresence>
            </FeedbackOpenProvider>
            </FileOpenProvider>
          </LinkOpenProvider>
        </MemoryUiProvider>
          </SkillOpenProvider>
  );
}
