import { BRAND } from "@openmasq/branding";
import { useState } from "react";
import { BrowserIcon } from "../../../components/brand";

import { useT } from "../../../i18n";
/**
 * What the panel shows IN PLACE of the page when the "browser" connector is
 * disconnected: the reason, and the gesture that lifts it.
 *
 * Before, this state displayed "Loading agent browser…" indefinitely — a
 * lie (nothing was loading) compounded by a dead end (no way out from
 * there; you had to guess Réglages → Connecteurs).
 *
 * ⚠️ This button is only clickable BECAUSE the caller stopped mounting the
 * native window in this state (`BrowserPanel` then passes no `browser` to
 * `useBrowserBounds`): that window is `alwaysOnTop` and has no DOM order, so
 * anything drawn under it is invisible AND out of the pointer's reach.
 */
export function BrowserPlaceholder({
  hasBrowser,
  offline,
  onConnect,
}: {
  /** The platform HAS an agent browser (`host.browser`) — false in a web/mobile aperçu. */
  hasBrowser: boolean;
  /** The MCP connector is disconnected AND reconnectable here. */
  offline: boolean;
  onConnect: () => Promise<unknown>;
}) {
  const t = useT();
  if (!hasBrowser)
    return <div className="vb-empty">{t.conversation.browser.unavailable}</div>;
  if (!offline) return <div className="vb-empty vb-empty-behind">{t.conversation.browser.loading}</div>;
  return <BrowserOffline onConnect={onConnect} />;
}

function BrowserOffline({ onConnect }: { onConnect: () => Promise<unknown> }) {
  const t = useT();
  const [connecting, setConnecting] = useState(false);
  return (
    <div className="vb-empty vb-offline">
      <BrowserIcon size={26} />
      <p className="vb-offline-title">{t.conversation.browser.offlineTitle}</p>
      <p className="vb-offline-sub">
        {t.conversation.browser.offlineSub(BRAND.name)}
      </p>
      <button
        type="button"
        className="btn-primary btn-inline"
        disabled={connecting}
        onClick={() => {
          setConnecting(true);
          // A failure RETURNS to the same screen, button re-armed: the connector card
          // (Réglages) stays the path that explains why. Never a frozen spinner.
          void onConnect().finally(() => setConnecting(false));
        }}
      >
        {connecting ? t.conversation.browser.activating : t.conversation.browser.activate}
      </button>
    </div>
  );
}
