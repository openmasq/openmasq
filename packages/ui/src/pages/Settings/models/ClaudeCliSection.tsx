import { useEffect, useState } from "react";
import { useHost, type Host } from "../../../host";
import { Switch } from "../../../components/brand";

import { useT } from "../../../i18n";
/**
 * Les opt-in « abonnement par CLI » — `claude-cli` (Claude Code) et `codex-cli`
 * (Gemini) : servir le chat par une CLI installée sur la machine (le moteur desktop
 * `subscription/`), sans clé API, sur le compte personnel de l'utilisateur.
 *
 * Une section par CLI, chacune dessinée SEULEMENT si le host sait sonder la sienne :
 * sur une plateforme qui ne peut pas la spawner, promettre le réglage serait mentir.
 * La sonde est locale (présence du binaire) et ne lance rien ; l'auth se constate au
 * premier envoi. Les réglages restent OFF par défaut — l'app ne consomme jamais le
 * compte personnel de quelqu'un sans un geste explicite. Un seul cœur pour les deux
 * (règle 9) : seuls le vocabulaire et le créneau de sonde varient.
 */
function CliOptInSection({
  slot,
  title,
  note,
  rowTitle,
  onDesc,
  missingDesc,
  enabled,
  onEnabled,
}: {
  slot: "probeClaudeCli" | "probeCodexCli";
  title: string;
  note: string;
  rowTitle: string;
  onDesc: string;
  missingDesc: string;
  enabled: boolean;
  onEnabled: (on: boolean) => void;
}) {
  const host = useHost();
  const canProbe = !!host[slot];
  const [detected, setDetected] = useState<boolean | null>(null);
  useEffect(() => {
    const probe = host[slot];
    if (!probe) return;
    let cancelled = false;
    probe
      .call(host as Host)
      .then((ok) => !cancelled && setDetected(ok))
      .catch(() => !cancelled && setDetected(false));
    return () => {
      cancelled = true;
    };
  }, [host, slot]);
  if (!canProbe) return null;

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{title}</div>
      <p className="modal-note">{note}</p>
      <div className="settings-card">
        <div className="toggle-row">
          <div className="row-body">
            <div className="row-title">{rowTitle}</div>
            <div className="row-desc">{detected === false ? missingDesc : onDesc}</div>
          </div>
          <Switch checked={enabled} onChange={onEnabled} />
        </div>
      </div>
    </section>
  );
}

export function ClaudeCliSection(props: { enabled: boolean; onEnabled: (on: boolean) => void }) {
  const t = useT();
  return (
    <CliOptInSection
      slot="probeClaudeCli"
      {...t.modelPicker.cli.claude}
      {...props}
    />
  );
}

export function CodexCliSection(props: { enabled: boolean; onEnabled: (on: boolean) => void }) {
  const t = useT();
  return (
    <CliOptInSection
      slot="probeCodexCli"
      {...t.modelPicker.cli.codex}
      {...props}
    />
  );
}
