import { captureError } from "../../analytics";
import { BRAND } from "@openmasq/branding";

/**
 * A failure of the encrypted DB is NEVER silent — it was the worst class of bug from
 * the observability audit (13/08): `saveConversation(...).catch(() => {})` let a full
 * disk / a locked DB / a corruption "succeed" in memory, and the last hours of
 * conversations AND THEIR VAULTS vanished on restart without
 * a single line anywhere. Here: console (the machine) + `captureError` (the $exception
 * channel, bounded and content-free — scope/code/name/error message only, never actual data).
 *
 * The FALLBACK behavior doesn't change: a failed save stays non-blocking (the app lives
 * in memory), a failed load returns `null` and leaves the mirror CUT OFF — re-enabling it
 * would overwrite a DB we failed to read with the PURGED copy from
 * localStorage (without vaults), i.e. turn a read failure into
 * data loss. We state the failure; we don't "repair" blindly.
 */
export const dbFailure =
  (code: string) =>
  (e: unknown): void => {
    // eslint-disable-next-line no-console
    console.error(`[${BRAND.slug}] db.${code} a échoué :`, e);
    captureError({
      scope: "db",
      code,
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
    });
  };

/** The load fallback: reports, then returns `null` (same contract as before — the
 *  mirror stays cut off, see the header). */
export const dbLoadFailure = (e: unknown): null => {
  dbFailure("load")(e);
  return null;
};
