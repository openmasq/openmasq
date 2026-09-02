import { useEffect, useState } from "react";
import { LayersIcon } from "../../../../components/brand";
import { ConfirmDialog } from "../../../../components/feedback/ConfirmDialog";
import { useHost } from "../../../../host";
import { useT } from "../../../../i18n/I18nProvider";
import { useUpdates } from "../useUpdates";
import { envLabel } from "./updateStatus";
import { envSwitchOffered, otherEnv, switchRefusalText } from "./envView";

// The ENVIRONMENT card of the Versions tab: which environment this instance resolved
// (production/staging), and — for a tester account, a privileged device, or any app
// already on staging — the button to switch. The build is the same on both sides;
// switching rewrites the local pointer and restarts the app.
//
// Visibility is UX (`envView.ts`): the REAL gate lives again in the privileged
// process on every request (name allow-list + server permission, fail-closed), and
// a refusal is shown as-is — never a silence.

export function EnvCard() {
  const host = useHost();
  const t = useT();
  const { crossEnv } = useUpdates();
  const [tester, setTester] = useState(false);
  const [busy, setBusy] = useState(false);
  // The switch asks first — in the app's own dialog (`ConfirmDialog`), never the
  // system `window.confirm`, which wears the OS chrome and ignores the theme.
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const env = host.env;

  useEffect(() => {
    if (!env) return;
    let live = true;
    // Display only, fail-closed: with no response, the offer doesn't appear.
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
  // The self-hosted stack has its name in the catalogue; the baked environments, theirs.
  const currentLabel = env.name === "custom" ? t.selfHost.envLabel : envLabel(env.name, t);
  const description =
    env.name === "custom"
      ? t.selfHost.envDescription
      : env.name === "staging"
        ? t.versionsTab.envStagingDesc
        : t.versionsTab.envProductionDesc;

  const onSwitch = async () => {
    setConfirming(false);
    setBusy(true);
    setErr(null);
    const r = await env.switchTo(target).catch(() => null);
    // ok:true ⇒ the app restarts: nothing to render. Everything else gets said.
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
        <button onClick={() => setConfirming(true)} disabled={busy} className="ver-btn">
          <span className="om-sweep">{t.versionsTab.envSwitchTo(envLabel(target, t))}</span>
        </button>
      </div>
      {err && (
        <div className="ver-note ver-note-after">
          <span className="ver-note-icon">🔒</span>
          <span>{err}</span>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={t.versionsTab.envSwitchTo(envLabel(target, t))}
          message={t.versionsTab.envSwitchConfirm(envLabel(target, t))}
          confirmLabel={t.common.confirm}
          danger={false}
          onConfirm={() => void onSwitch()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
