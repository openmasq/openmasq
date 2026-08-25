import type { UpdateStatus } from "../../../../host";

// Pure presentation helpers for the Versions tab's update status. Split out of
// UpdatesSection.tsx to keep it under the 300-LOC cap (rule 1) — and because
// these are logic, not presentation (root rule: functionality lives in `.ts`).

/** Human update weight, e.g. "596 Mo" / "1,4 Go" — shown so the user knows the download size. */
export function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go` : `${Math.round(bytes / 1e6)} Mo`;
}

/** The live status line under the installed-build card: what the updater is doing
 *  right now, plus the tone class that colours it. */
export function statusLine(status: UpdateStatus): { text: string; tone: string } {
  const size = fmtSize(status.sizeBytes);
  const withSize = (s: string) => (size ? `${s} (${size})` : s);
  switch (status.state) {
    case "checking":
      return { text: "Recherche de mises à jour…", tone: "text-muted" };
    case "available":
      return { text: withSize(`Mise à jour ${status.version ?? ""} trouvée — téléchargement…`), tone: "text-strong" };
    case "downloading":
      return { text: withSize(`Téléchargement… ${Math.round(status.percent ?? 0)}%`), tone: "text-strong" };
    case "downloaded":
      return { text: withSize(`Version ${status.version ?? ""} prête à installer.`), tone: "text-strong" };
    case "not-available":
      return { text: "Vous êtes à jour.", tone: "text-muted" };
    case "error":
      // Already-humanised message from main (no raw ditto/pkzip dump). A disk-space
      // error carries `code:"no_space"` — render it with a warning tone.
      return {
        text: status.message ?? "Erreur inconnue.",
        tone: status.code === "no_space" ? "text-[var(--amber-600)]" : "text-[var(--red-500)]",
      };
  }
}

export const envLabel = (env: string): string => (env === "production" ? "Production" : "Staging");
