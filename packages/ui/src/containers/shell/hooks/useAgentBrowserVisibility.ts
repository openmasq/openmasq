import { useEffect, useRef } from "react";
import { useHost } from "../../../host";
import { invalidateAgentBrowserBounds, shouldHideAgentBrowser } from "../../../hooks/modalGate";
import { useAgentBrowserOffline } from "../../../hooks/useMcpConnectedIds";

/**
 * Own the agent-browser window's visibility GLOBALLY.
 *
 * That window is a SEPARATE process, `alwaysOnTop`, with no DOM z-index — so it covers
 * any DOM modal (write-confirmation, settings, confirm dialogs…) whenever it is visible,
 * even when the split is closed but the MODEL is driving it. It may therefore show ONLY
 * while a browser tab is actually on screen AND no modal is up.
 *
 * `onScreen` already encodes the section (the panel renders in `chats` + `library`), and
 * that section gate is essential: the browser tab persists across sections, so without it
 * the native window kept floating over the Library / Settings and swallowed every click
 * there. A `MutationObserver` drives the modal half so a modal mounting is caught
 * synchronously, with no frame lag — the write-confirm dialog is never hidden behind it.
 *
 * The mount-time `hide()` is the other half: browser TABS are not persisted across a
 * renderer reload, so a previously-open browser would otherwise stay floating with no
 * pane behind it.
 */
export function useAgentBrowserVisibility(onScreen: boolean): void {
  const host = useHost();
  const visibleRef = useRef(false);
  // ⚠️ CONNECTEUR DÉCONNECTÉ ⇒ la fenêtre ne monte pas, ici NON PLUS. Il y a DEUX
  // propriétaires de sa visibilité (celui-ci, global, et `useBrowserBounds` côté panneau) :
  // n'en museler qu'un ne sert à rien, l'autre la remonte aussitôt — c'est ce qui laissait
  // la carte « Le navigateur n'est pas connecté » recouverte par une frame vide. Les deux
  // lisent le MÊME fait (`useMcpConnectorConnected`), comme ils lisent déjà le même
  // `shouldHideAgentBrowser`. `null` (pas encore su) n'empêche rien : on ne cache que sur
  // un « non » CERTAIN.
  const disconnected = useAgentBrowserOffline();

  useEffect(() => {
    host.browser?.hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const b = host.browser;
    if (!b || !onScreen || disconnected) {
      if (visibleRef.current) {
        visibleRef.current = false;
        b?.hide();
      }
      return;
    }
    const sync = () => {
      const shouldShow = !shouldHideAgentBrowser();
      if (shouldShow === visibleRef.current) return;
      visibleRef.current = shouldShow;
      if (shouldShow) {
        // ⚠️ L'ÉCRIVAIN des bornes (`useBrowserBounds`) ignore cette remontée : sans ce
        // signal il garde sa dernière clé et n'émet rien, donc la fenêtre revient aux
        // bornes d'avant — décalée si la mise en page a bougé entre-temps.
        invalidateAgentBrowserBounds();
        b.show();
      } else b.hide();
    };
    // childList+subtree: modals mount/unmount as fresh nodes (ModalShell's
    // `.modal-scrim`, the auth scrim, a `role=dialog`), so this catches them.
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => obs.disconnect();
  }, [host.browser, onScreen, disconnected]);
}
