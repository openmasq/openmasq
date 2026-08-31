import { BRAND } from "@openmasq/branding";
import { useState } from "react";
import { BrowserIcon } from "../../../components/brand";

import { useT } from "../../../i18n";
/**
 * Ce que le panneau montre À LA PLACE de la page quand le connecteur « browser » est
 * déconnecté : la raison, et le geste qui la lève.
 *
 * Avant, cet état affichait « Chargement du navigateur agent… » indéfiniment — un
 * mensonge (rien ne chargeait) doublé d'une impasse (aucun moyen de s'en sortir depuis
 * là ; il fallait deviner Réglages → Connecteurs).
 *
 * ⚠️ Ce bouton n'est cliquable QUE parce que l'appelant a cessé de monter la fenêtre
 * native dans cet état (`BrowserPanel` ne passe alors pas de `browser` à
 * `useBrowserBounds`) : cette fenêtre est `alwaysOnTop` et n'a aucun ordre DOM, donc
 * tout ce qu'on dessine sous elle est invisible ET hors d'atteinte du pointeur.
 */
export function BrowserPlaceholder({
  hasBrowser,
  offline,
  onConnect,
}: {
  /** La plateforme A un navigateur agent (`host.browser`) — faux en aperçu web / mobile. */
  hasBrowser: boolean;
  /** Le connecteur MCP est déconnecté ET rattachable ici. */
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
          // Un échec REVIENT au même écran, bouton réarmé : la carte du connecteur
          // (Réglages) reste le chemin qui explique pourquoi. Jamais de spinner figé.
          void onConnect().finally(() => setConnecting(false));
        }}
      >
        {connecting ? t.conversation.browser.activating : t.conversation.browser.activate}
      </button>
    </div>
  );
}
