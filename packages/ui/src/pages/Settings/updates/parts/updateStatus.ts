import type { Messages } from "@openmasq/i18n";
import type { UpdateStatus } from "../../../../host";

// Pure presentation helpers for the Versions tab's update status. Split out of
// UpdatesSection.tsx to keep it under the 300-LOC cap (rule 1) — and because
// these are logic, not presentation (root rule: functionality lives in `.ts`).

/** Human update weight, e.g. "596 Mo" / "1,4 Go" — shown so the user knows the download size. */
export function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go`
    : `${Math.round(bytes / 1e6)} Mo`;
}

/** The live status line under the installed-build card: what the updater is doing
 *  right now, plus the tone class that colours it. */
export function statusLine(status: UpdateStatus, t: Messages): { text: string; tone: string } {
  const size = fmtSize(status.sizeBytes);
  const withSize = (s: string) => (size ? t.versionsTab.status.withSize(s, size) : s);
  switch (status.state) {
    case "checking":
      return { text: t.versionsTab.status.checking, tone: "text-muted" };
    case "available":
      return {
        text: withSize(t.versionsTab.status.available(status.version ?? "")),
        tone: "text-strong",
      };
    case "downloading":
      return {
        text: withSize(t.versionsTab.status.downloading(Math.round(status.percent ?? 0))),
        tone: "text-strong",
      };
    case "downloaded":
      return {
        text: withSize(t.versionsTab.status.downloaded(status.version ?? "")),
        tone: "text-strong",
      };
    case "not-available":
      return { text: t.versionsTab.status.notAvailable, tone: "text-muted" };
    case "error":
      // Already-humanised message from main (no raw ditto/pkzip dump). A disk-space
      // error carries `code:"no_space"` — render it with a warning tone.
      return {
        text: status.message ?? t.versionsTab.status.unknownError,
        tone: status.code === "no_space" ? "text-[var(--amber-600)]" : "text-[var(--red-500)]",
      };
  }
}

/** Le nom d'un environnement CUIT. La pile auto-hébergée a le sien dans le catalogue
 *  (`t.selfHost.envLabel`) — ici un repli neutre, jamais « Staging » pour ce qui n'en est pas. */
export const envLabel = (env: string, t: Messages): string =>
  env === "production"
    ? t.versionsTab.envProduction
    : env === "staging"
      ? t.versionsTab.envStaging
      : t.versionsTab.envCustom;
