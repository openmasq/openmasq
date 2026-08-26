import { useEffect, useState } from "react";
import { useHost } from "../../../host";
import { Switch } from "../../../components/brand";

/**
 * « Votre abonnement Claude » — l'opt-in du fournisseur `claude-cli` : servir le chat
 * par la CLI Claude Code installée sur la machine (le moteur desktop `subscription/`),
 * sans clé API, sur l'abonnement Claude personnel de l'utilisateur.
 *
 * Ne se dessine QUE si le host sait sonder la CLI (`probeClaudeCli`) : sur une
 * plateforme qui ne peut pas la spawner, promettre le réglage serait mentir. La sonde
 * est locale (présence du binaire) et ne lance rien ; l'auth se constate au premier
 * envoi. Le réglage reste OFF par défaut — l'app ne consomme jamais l'abonnement
 * personnel de quelqu'un sans un geste explicite.
 */
export function ClaudeCliSection({
  enabled,
  onEnabled,
}: {
  enabled: boolean;
  onEnabled: (on: boolean) => void;
}) {
  const host = useHost();
  const canProbe = !!host.probeClaudeCli;
  const [detected, setDetected] = useState<boolean | null>(null);
  useEffect(() => {
    if (!host.probeClaudeCli) return;
    let cancelled = false;
    host
      .probeClaudeCli()
      .then((ok) => !cancelled && setDetected(ok))
      .catch(() => !cancelled && setDetected(false));
    return () => {
      cancelled = true;
    };
  }, [host]);
  if (!canProbe) return null;

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">Votre abonnement Claude</div>
      <p className="modal-note">
        Si vous avez un abonnement Claude et la CLI Claude Code installée, vos
        conversations peuvent passer par elle — sans clé API. Le redaction s'applique
        comme partout : le modèle ne voit que des données remplacées.
      </p>
      <div className="settings-card">
        <div className="toggle-row">
          <div className="row-body">
            <div className="row-title">Utiliser ma CLI Claude Code</div>
            <div className="row-desc">
              {detected === false
                ? "CLI introuvable sur cette machine : installez Claude Code et connectez-le à votre compte Claude, puis revenez ici."
                : "Ajoute « Claude Code » à la liste des modèles. Chaque envoi consomme votre abonnement Claude personnel."}
            </div>
          </div>
          <Switch checked={enabled} onChange={onEnabled} />
        </div>
      </div>
    </section>
  );
}
