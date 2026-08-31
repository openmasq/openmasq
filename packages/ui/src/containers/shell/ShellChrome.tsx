import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { panelOpenFile, useAppDispatch } from "../../state/redux";
import { CompetenceOpenProvider } from "../../competences/competenceOpen";
import { MemoryUiProvider } from "../../memory/memoryUi";
import { LinkOpenProvider } from "../providers/linkOpen";
import { FileOpenProvider } from "../providers/fileOpen";
import { makeConnectOpenRouter } from "../../state/connectOpenRouter";
import { AvisOpenProvider } from "../providers/avisOpen";
import { useOpenConnector } from "../providers/connectors";
import { needsAccessNotice } from "../../state/accessNotice";
import { hasEstablishedAccount } from "../../state/establishedAccount";
import { AvisModal, GuideModal, SearchModal, UpdateReadyModal } from "../modals";
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
  const { chat, overlay, avis, search, deep, conv, mcpReconnect } = shell;
  const openConnector = useOpenConnector();
  // Refermée pour la session : la condition, elle, ne disparaît qu'en ajoutant un accès.
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
  /* Un compte DÉJÀ ÉTABLI (abonnement payant chargé, ou membre d'une organisation) qui
     ouvre un NOUVEL appareil ne repasse pas par l'accueil : `onboarded` est local à la
     machine (jamais synchronisé), donc sans ceci un abonné retombait sur le pipeline
     complet — étape « Abonnement, ou votre clé » comprise — à chaque nouvelle machine.
     La décision (et pourquoi `null` = inconnu ⇒ on ne saute pas, et pourquoi on ne touche
     pas `billingMode`) vit dans `state/establishedAccount.ts`. Si la facturation arrive
     pendant que l'accueil est à l'écran, il se referme : c'est le but. */
  const established = hasEstablishedAccount({
    personalSub: chat.personalSub,
    orgProfile: chat.orgProfile,
  });
  const onboarded = !!chat.settings.onboarded;
  useEffect(() => {
    if (!established || onboarded) return;
    chat.setSettings({ ...chat.settings, onboarded: true });
    // `chat` change d'identité à chaque rendu ; la garde ci-dessus rend l'effet idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [established, onboarded]);

  const notice = pickShellNotice(
    { reconnecting: shell.reconnecting, mcpItems: mcpReconnect.items, showAccess },
    t,
  );
  const runNoticeAction = (kind: ShellNoticeKind) => {
    if (kind === "access") return deep.openSettings("models");
    if (kind !== "mcp") return;
    // Reconnecter là où on est : la pastille ouvre la modale du connecteur par-dessus
    // l'écran courant, sans détour par les Réglages (on y retombe si rien ne la monte).
    const id = mcpReconnect.items[0]?.id;
    if (!id) return;
    if (openConnector) openConnector(id);
    else deep.openSettings("mcp", id);
  };
  const dismissNotice = (kind: ShellNoticeKind) => {
    if (kind === "mcp") mcpReconnect.dismiss();
    if (kind === "access") setAccessSeen(true);
  };

  /* `aria-hidden` DIT que le fond est hors-jeu ; `inert` le REND vrai — sans lui, la
     première tabulation depuis la modale de connexion ou d'accueil atterrit DERRIÈRE
     (mesuré : sur le logo du rail). Posé par une ref : `inert` n'est pas une propriété
     connue de cette version de React. */
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
    <CompetenceOpenProvider value={deep.openCompetenceById}>
              <MemoryUiProvider value={deep.memoryUiApi}>
          <LinkOpenProvider value={shell.pane.linkOpenApi}>
            <FileOpenProvider value={shell.pane.fileOpenApi}>
            <AvisOpenProvider value={avis.api}>
              {/* One delegated listener for every `title` in the app — mounted HERE, on
                  the surround both platforms share, so a control labelled on one is
                  labelled on the other. It renders nothing until something is hovered. */}
              <TooltipLayer />
              <div
                ref={appRef}
                className={`${overlay ? "app app-behind" : "app"}${className ? ` ${className}` : ""}`}
                aria-hidden={overlay ? true : undefined}
              >
                {/* Les états PERMANENTS de l'app — serveur d'auth injoignable (on GARDE
                    la session ouverte au lieu de renvoyer au login), connecteur distant
                    tombé, ni abonnement ni clé. Un seul à la fois, choisi par
                    `pickShellNotice`, et rendu en PASTILLE : trois barres pleine largeur
                    se relayaient au-dessus du composeur et confisquaient tout le bas de
                    l'écran pour une phrase déjà lue. Le titre suffit ; le message et
                    l'action sont à un clic. Chacune se tait d'elle-même — la panne quand
                    elle est réparée, l'information quand on la referme. */}
                {notice && (
                  <div className="kchip-dock" role="status" aria-live="polite">
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
                  </div>
                )}
                {nav}
                <AnimatePresence>
                  {avis.open && (
                    <AvisModal
                      onClose={() => avis.setOpen(null)}
                      // What identifies the build and the moment — never conversation
                      // content. Assembled in `useAvis`, gated by `buildFeedback`.
                      context={avis.context}
                      prefill={avis.open.prefill}
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
                {/* ⚠️ Jamais par-dessus la connexion ni l'accueil : la mise à jour attend,
                    et se faire annoncer une version avant même d'être entré n'a pas de
                    sens. Elle n'est pas perdue pour autant — le rail droit la rouvre. */}
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
              {/* SÉRIALISÉE, jamais concurrente d'un overlay. Cette carte vit hors de la
                  pile d'overlays (z-index 55 contre 120 pour le voile), donc pendant le
                  login/onboarding elle s'affichait à moitié cachée sous la modale : phrase
                  tronquée en plein milieu, et un « Compris » que le voile interceptait —
                  visible, lisible, et mort au clic. Une décision à la fois. */}
              {!overlay && <AnalyticsNotice settings={chat.settings} onChange={chat.setSettings} />}
            </AvisOpenProvider>
            </FileOpenProvider>
          </LinkOpenProvider>
        </MemoryUiProvider>
          </CompetenceOpenProvider>
  );
}
