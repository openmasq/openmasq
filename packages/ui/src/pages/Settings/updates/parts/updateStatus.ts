import { BRAND } from "@openmasq/branding";
import type { Messages } from "@openmasq/i18n";
import type { UpdateStatus } from "../../../../host";

// Pure presentation helpers for the Versions tab's update status. Split out of
// UpdatesSection.tsx to keep it under the 300-LOC cap (rule 1) — and because
// these are logic, not presentation (root rule: functionality lives in `.ts`).

/** Human update weight, e.g. "596 Mo" / "1,4 Go" — shown so the user knows the download size. */
function fmtSize(bytes?: number): string {
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
      // A disk-space error carries `code:"no_space"` — render it with a warning tone.
      return {
        text: updateErrorText(status, t),
        tone: status.code === "no_space" ? "text-[var(--amber-600)]" : "text-[var(--red-500)]",
      };
  }
}

/** The line for a failed update, in the user's language, chosen by the stable `code` main
 *  sends (`apps/desktop/src/main/updates/disk.ts`). An unknown code falls back to main's
 *  own message, never to a raw dump. A feed 5xx (`download-5xx`) is the SERVER's fault:
 *  telling the user to check their connection would send them after the wrong cause. */
export function updateErrorText(status: Pick<UpdateStatus, "code" | "message">, t: Messages): string {
  const e = t.versionsTab.status.errors;
  const code = status.code ?? "";
  if (/^download-5\d\d$/.test(code)) return e.server;
  if (code === "download" || /^download-\d{3}$/.test(code)) return e.download;
  switch (code) {
    case "no_space":
      return e.noSpace;
    case "read_only_volume":
      return e.readOnlyVolume(BRAND.name);
    case "app_running":
      return e.appRunning(BRAND.name);
    case "signature":
      return e.signature;
    case "network":
      return e.network;
    case "generic":
      return e.generic;
    default:
      return status.message ?? t.versionsTab.status.unknownError;
  }
}

/** A BAKED-IN environment's name. The self-hosted stack has its own in the catalogue
 *  (`t.selfHost.envLabel`) — here a neutral fallback, never « Staging » for what isn't. */
export const envLabel = (env: string, t: Messages): string =>
  env === "production"
    ? t.versionsTab.envProduction
    : env === "staging"
      ? t.versionsTab.envStaging
      : t.versionsTab.envCustom;
