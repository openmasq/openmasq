import { useState } from "react";
import { CheckIcon, RefreshIcon } from "../../../../components/brand";
import { statusLine } from "./updateStatus";
import type { UpdateStatus, UpdatesCurrent } from "../../../../host";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../../../i18n";
// The Versions tab's installed-build card + auto-update toggle + live status line,
// mirroring the design-system `VersionsSection`'s "VERSION INSTALLÉE" block: an ink
// tile with a lime check, the running version + channel, and the manual check.
// Split out of UpdatesSection.tsx to keep both files under the 300-LOC cap (rule 1).

export function InstalledCard({
  current,
  status,
  check,
  install,
}: {
  current?: UpdatesCurrent | null;
  status: UpdateStatus | null;
  check: () => void;
  install: () => void;
}) {
  const t = useT();
  const [copiedId, setCopiedId] = useState(false);
  const line = status ? statusLine(status, t) : null;
  const downloaded = status?.state === "downloaded";

  const copyInstallId = () => {
    if (!current?.installId) return;
    void navigator.clipboard
      .writeText(current.installId)
      .then(() => {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 1400);
      })
      .catch(() => {});
  };

  return (
    <>
      <div className="ver-now om-sweep-host">
        <span className="ver-now-mark">
          <CheckIcon size={22} />
        </span>
        <div className="flex-min">
          <div className="ver-now-name">
            <span className="om-sweep">
              {BRAND.name} {current?.version ?? "—"}
            </span>
          </div>
          <div className="ver-now-chan">
            {t.versionsTab.channel} <span className="font-mono">{current?.channel ?? "—"}</span>
            {(!status || status.state === "not-available") && t.versionsTab.upToDateSuffix}
          </div>
          {current?.installId && (
            <button onClick={copyInstallId} title={t.versionsTab.copyIdTip} className="ver-now-id">
              {copiedId ? (
                <>
                  <CheckIcon size={11} /> {t.versionsTab.idCopied}
                </>
              ) : (
                <>ID&nbsp;{current.installId.slice(0, 8)}… ⧉</>
              )}
            </button>
          )}
        </div>
        {downloaded ? (
          <button onClick={install} className="ver-btn primary">
            {t.versionsTab.installRestart}
          </button>
        ) : (
          <button onClick={check} className="ver-btn">
            <RefreshIcon size={14} /> <span className="om-sweep">{t.versionsTab.checkUpdates}</span>
          </button>
        )}
      </div>

      {/* live status */}
      {line && (
        <div className="ver-status">
          <div className={`ver-status-line ${line.tone}`}>{line.text}</div>
          {status?.state === "downloading" && (
            <div className="ver-progress">
              {/* the percentage is a runtime value → the sanctioned inline style */}
              <div
                className="ver-progress-fill"
                style={{ width: `${Math.round(status.percent ?? 0)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
