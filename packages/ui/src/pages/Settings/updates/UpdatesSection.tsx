import { useState } from "react";
import { CheckIcon } from "../../../components/brand";
import { useUpdates, compareVersions, ensureCurrentInReleases } from "./useUpdates";
import { useReleaseNotes } from "../../../state/settings/releaseNotes";
import { noteLookup, ReleaseTable } from "./ReleaseHistory";
import { InstalledCard } from "./parts/InstalledCard";
import { PublishedNotes } from "./parts/PublishedNotes";
import { envLabel, statusLine } from "./parts/updateStatus";
import { versionsView } from "./parts/versionsView";
import type { DesktopRelease } from "../../../host";
import { useHost } from "../../../host";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../../i18n";
// Auto-update section of the Versions tab (desktop only — gated on host.updates).
// Shows the running version + channel, a manual check with a live status line,
// and the published releases. A PRIVILEGED device (operator-granted self-pin)
// additionally sees BOTH environments (staging + production) and can SWITCH — a
// switch reinstalls the other env's build (its API URLs are baked in), so it also
// moves the app between staging and production.
//
// Mirrors the design-system `VersionsSection`: the installed-build card (in
// parts/InstalledCard.tsx), then the history under an eyebrow. The kit's
// Production/Staging SEGMENTED control is used for the privileged cross-env view —
// one environment at a time, so a long staging feed can't bury production.

export function UpdatesSection() {
  const t = useT();
  const {
    available,
    current,
    releases,
    status,
    error,
    canPin,
    allChannels,
    crossEnv,
    check,
    pin,
    switchTo,
    install,
  } = useUpdates();
  const host = useHost();
  // Release notes copy comes from Contentful via analytics-fn (`/release-notes`),
  // matched to each build version — so "what's new" lives in the CMS, not the app.
  const { notes } = useReleaseNotes();
  const noteFor = noteLookup(notes);
  // Which environment the privileged picker is showing. `null` = "not chosen yet",
  // resolved below to the device's OWN channel so the view opens on what is running.
  const [segEnv, setSegEnv] = useState<string | null>(null);
  // Always surface the RUNNING build as a history row (own-channel view) so its
  // release note shows even when the channel feed lists no build for it — e.g. a dev
  // build on the empty default `desktop-production` channel.
  const ownReleases = ensureCurrentInReleases(releases, current?.version);
  if (!available) return null;

  const onPick = (version: string) => {
    if (current && compareVersions(version, current.version) < 0) {
      if (!window.confirm(`Revenir à la version ${version} ? L'app redémarrera pour l'appliquer.`))
        return;
    }
    pin(version);
  };

  const onSwitch = (channel: string, env: string, version: string) => {
    if (!window.confirm(t.versionsTab.switchConfirm(version, envLabel(env, t)))) return;
    switchTo(channel, version);
  };

  const currentTag = (
    <span className="ver-curtag">
      <CheckIcon size={11} /> {t.versionsTab.current}
    </span>
  );

  const rowBtn = (label: string, title: string, onClick: () => void) => (
    <button onClick={onClick} title={title} className="ver-btn row">
      <span className="om-sweep">{label}</span>
    </button>
  );

  // The channel the segmented control is on: the user's pick, else the running
  // build's own env, else the first published environment.
  const activeChannel =
    allChannels.find((c) => c.env === segEnv) ??
    allChannels.find((c) => c.channel === current?.channel) ??
    allChannels[0];

  const history = crossEnv ? (
    activeChannel ? (
      activeChannel.releases.length === 0 ? (
        <div className="ver-table ver-empty">{t.versionsTab.noRelease}</div>
      ) : (
        <ReleaseTable
          releases={activeChannel.releases}
          currentVersion={current?.version}
          noteFor={noteFor}
          isCurrent={(r) =>
            current?.version === r.version && current?.channel === activeChannel.channel
          }
          action={(r: DesktopRelease, cur: boolean) =>
            cur
              ? currentTag
              : rowBtn(t.versionsTab.switchTo, t.versionsTab.switchToVersion(r.version), () =>
                  onSwitch(activeChannel.channel, activeChannel.env, r.version),
                )
          }
        />
      )
    ) : (
      <div className="ver-table ver-empty">{t.versionsTab.noRelease}</div>
    )
  ) : error ? (
    <div className="ver-table ver-empty">{error}</div>
  ) : ownReleases.length === 0 ? (
    <div className="ver-table ver-empty">{t.versionsTab.noRelease}</div>
  ) : (
    <ReleaseTable
      releases={ownReleases}
      currentVersion={current?.version}
      noteFor={noteFor}
      isCurrent={(r) => current?.version === r.version}
      action={(r: DesktopRelease, cur: boolean) => {
        if (cur) return currentTag;
        if (!canPin) return null;
        const older = current ? compareVersions(r.version, current.version) < 0 : false;
        return older
          ? rowBtn(t.versionsTab.revert, t.versionsTab.revertTo(r.version), () => onPick(r.version))
          : rowBtn(t.versionsTab.install, t.versionsTab.installVersion(r.version), () =>
              onPick(r.version),
            );
      }}
    />
  );

  // What this page tells depends on WHO it's talking to: `versionsView.ts` decides,
  // here we render. On a production build, « which version, which channel, which
  // history » answers no question the user is asking — the app updates itself.
  // The full detail stays on staging and for a privileged device.
  const view = versionsView(status, {
    current,
    channels: allChannels,
    privileged: canPin || crossEnv,
  });

  if (view.kind !== "technical") {
    return (
      <section className="mb-6">
        <div className="cv-eyebrow ver-eyebrow">{t.versionsTab.updatesEyebrow}</div>
        {view.kind === "upToDate" ? (
          <p className="ver-uptodate">
            <CheckIcon size={14} /> {t.versionsTab.upToDate(BRAND.name)}
          </p>
        ) : (
          // The updater is working or has failed: IT is the one talking, never « à jour ».
          <p className={`ver-sub ${statusLine(status!, t).tone}`}>{statusLine(status!, t).text}</p>
        )}
        <InstalledCard current={null} status={status} check={check} install={install} />
        {/* The technical view attaches a note UNDER each build; here there's no build to
            list — but the question « qu'est-ce qui a changé ? » stays the same. */}
        <PublishedNotes />
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="cv-eyebrow ver-eyebrow">{t.versionsTab.installedEyebrow}</div>
      <p className="ver-sub">
        {BRAND.name} se met à jour automatiquement. Vous pouvez vérifier maintenant
        {crossEnv ? t.versionsTab.orSwitchEnv : canPin ? t.versionsTab.orRevert : "."}
      </p>

      <InstalledCard current={current} status={status} check={check} install={install} />

      {/* history head — the kit pairs the eyebrow with a Production/Staging segment */}
      <div className="ver-hist-head">
        <div className="cv-eyebrow ver-eyebrow">{t.versionsTab.historyEyebrow}</div>
        {crossEnv && allChannels.length > 1 && (
          <div className="ver-seg">
            {allChannels.map((ch) => (
              <button
                key={ch.channel}
                className={`ver-seg-btn ${activeChannel?.channel === ch.channel ? "on" : ""}`}
                onClick={() => setSegEnv(ch.env)}
              >
                {envLabel(ch.env, t)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!crossEnv && !canPin && (
        <div className="ver-note">
          <span className="ver-note-icon">🔒</span>
          <span>{t.versionsTab.locked}</span>
        </div>
      )}

      {history}

      {/* The update log: the only trace of the real reason behind a failed
          `quitAndInstall` used to live in a file no UI could reach
          (audit 13/08). Fixed path on the main side; absent (web preview) ⇒ nothing. */}
      {host.updates?.revealLog && (
        <div className="ver-note ver-note-after">
          <button
            className="ver-btn row"
            title={t.versionsTab.revealLogTip}
            onClick={() => void host.updates!.revealLog!()}
          >
            {t.versionsTab.revealLog}
          </button>
        </div>
      )}

      {/* The kit warns that pre-release builds are unstable — surface it only when
          the picker is actually showing a non-production environment. */}
      {crossEnv && activeChannel && activeChannel.env !== "production" && (
        <div className="ver-note ver-note-after">
          <span className="ver-note-icon">🔒</span>
          {t.versionsTab.stagingWarning}
        </div>
      )}
    </section>
  );
}
