/**
 * WHETHER Sentry initializes at all — decided once, before any DSN is read, from two
 * facts the process knows for certain: is this a PACKAGED app, and did a CI bake an
 * update channel into it. Pure, so `gate.test.ts` pins every cell of the table.
 *
 * Three kinds of build, and what each may report:
 *
 * - `dev` (`pnpm dev`, not packaged) — **nothing**. A developer's instance crashes on
 *   half-written code; those reports once made 57% of the board.
 * - `local` (packaged, but no channel — a `pnpm run eb` outside CI) — **nothing either**:
 *   its code may differ from any release, so a stack trace from it describes code nobody
 *   else runs and would be read as a product bug. Its USAGE still counts, tagged — that is
 *   the analytics tier (`@openmasq/ui` `analytics/tier.ts`), not this file.
 * - `distributed` (packaged AND a CI-baked channel) — the fleet. The ONLY kind that reports
 *   (product decision, 03/09/2026, reversing the 01/09 one).
 *
 * `OPENMASQ_SENTRY_DEV=1` reopens the channel on ONE machine for `dev` and `local`, to
 * verify the chain end to end — a valve, never a default.
 *
 * The renderer's own gate is the same boundary seen from Vite (`import.meta.env.DEV`,
 * valve `VITE_SENTRY_DEV=1`) — `renderer.ts`.
 */
export type BuildKind = "dev" | "local" | "distributed";

/** `channel` = `VITE_UPDATES_CHANNEL`, baked by CI only (`release.yml`); empty locally. */
export function buildKind(packaged: boolean, channel: string | undefined | null): BuildKind {
  if (!packaged) return "dev";
  return (channel ?? "").trim() ? "distributed" : "local";
}

/** `devValve` = `process.env.OPENMASQ_SENTRY_DEV`. */
export function sentryEnabled(kind: BuildKind, devValve: string | undefined): boolean {
  if (kind === "distributed") return true;
  return devValve === "1";
}
