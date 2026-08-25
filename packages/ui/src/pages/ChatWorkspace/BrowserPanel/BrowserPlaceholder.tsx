import { BRAND } from "@openmasq/branding";
import { useState } from "react";
import { BrowserIcon } from "../../../components/brand";

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
  if (!hasBrowser)
    return <div className="vb-empty">Navigateur agent indisponible sur cette plateforme.</div>;
  if (!offline) return <div className="vb-empty vb-empty-behind">Chargement du navigateur agent…</div>;
  return <BrowserOffline onConnect={onConnect} />;
}

function BrowserOffline({ onConnect }: { onConnect: () => Promise<unknown> }) {
  const [connecting, setConnecting] = useState(false);
  return (
    <div className="vb-empty vb-offline">
      <BrowserIcon size={26} />
      <p className="vb-offline-title">Le navigateur n'est pas connecté.</p>
      <p className="vb-offline-sub">
        Activez-le pour consulter le web ici, et laisser {BRAND.name} y chercher pour vous.
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
        {connecting ? "Activation…" : "Activer le navigateur"}
      </button>
    </div>
  );
}
