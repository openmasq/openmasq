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
  // ⚠️ CONNECTOR DISCONNECTED ⇒ the window doesn't mount here EITHER. There are TWO
  // owners of its visibility (this one, global, and `useBrowserBounds` on the panel side):
  // muzzling only one does nothing, the other brings it back up right away — that's what
  // used to leave the « Le navigateur n'est pas connecté » card covered by an empty frame. Both
  // read the SAME fact (`useMcpConnectorConnected`), just as they already read the same
  // `shouldHideAgentBrowser`. `null` (not yet known) prevents nothing: we only hide on
  // a CERTAIN « no ».
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
        // ⚠️ The bounds WRITER (`useBrowserBounds`) ignores this remount: without this
        // signal it keeps its last key and emits nothing, so the window comes back to the
        // previous bounds — offset if the layout has moved in the meantime.
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
