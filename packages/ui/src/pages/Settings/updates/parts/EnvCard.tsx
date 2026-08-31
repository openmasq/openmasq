import { useEffect, useState } from "react";
import { LayersIcon } from "../../../../components/brand";
import { useHost } from "../../../../host";
import { useT } from "../../../../i18n/I18nProvider";
import { useUpdates } from "../useUpdates";
import { envLabel } from "./updateStatus";
import { envSwitchOffered, otherEnv, switchRefusalText } from "./envView";

// La carte ENVIRONNEMENT du tab Versions : quel environnement cette instance a résolu
// (production/staging), et — pour un compte testeur, un appareil privilégié, ou toute
// app déjà sur staging — le bouton pour basculer. La build est la même des deux côtés ;
// basculer réécrit le pointeur local et redémarre l'app.
//
// La visibilité est de l'UX (`envView.ts`) : la VRAIE porte revit dans le processus
// privilégié à chaque demande (allow-list de noms + permission serveur, fail-closed), et
// un refus est montré tel quel — jamais un silence.

export function EnvCard() {
  const host = useHost();
  const t = useT();
  const { crossEnv } = useUpdates();
  const [tester, setTester] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const env = host.env;

  useEffect(() => {
    if (!env) return;
    let live = true;
    // Affichage seulement, fail-closed : sans réponse, la proposition n'apparaît pas.
    env
      .stagingTester()
      .then((v) => {
        if (live) setTester(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [env]);

  if (!env) return null;
  if (!envSwitchOffered({ env: env.name, stagingTester: tester, crossEnv })) return null;

  const target = otherEnv(env.name);
  // La pile auto-hébergée a son nom dans le catalogue ; les environnements cuits, le leur.
  const currentLabel = env.name === "custom" ? t.selfHost.envLabel : envLabel(env.name, t);
  const description =
    env.name === "custom"
      ? t.selfHost.envDescription
      : env.name === "staging"
        ? t.versionsTab.envStagingDesc
        : t.versionsTab.envProductionDesc;

  const onSwitch = async () => {
    if (!window.confirm(t.versionsTab.envSwitchConfirm(envLabel(target, t)))) return;
    setBusy(true);
    setErr(null);
    const r = await env.switchTo(target).catch(() => null);
    // ok:true ⇒ l'app redémarre : rien à rendre. Tout le reste se dit.
    if (!r || !r.ok) {
      setErr(switchRefusalText(r?.reason, t));
      setBusy(false);
    }
  };

  return (
    <section className="mb-6">
      <div className="cv-eyebrow ver-eyebrow">{t.versionsTab.envEyebrow}</div>
      <div className="ver-now om-sweep-host">
        <span className="ver-now-mark">
          <LayersIcon size={22} />
        </span>
        <div className="flex-min">
          <div className="ver-now-name">
            <span className="om-sweep">{currentLabel}</span>
          </div>
          <div className="ver-now-chan">{description}</div>
        </div>
        <button onClick={onSwitch} disabled={busy} className="ver-btn">
          <span className="om-sweep">{t.versionsTab.envSwitchTo(envLabel(target, t))}</span>
        </button>
      </div>
      {err && (
        <div className="ver-note ver-note-after">
          <span className="ver-note-icon">🔒</span>
          <span>{err}</span>
        </div>
      )}
    </section>
  );
}
