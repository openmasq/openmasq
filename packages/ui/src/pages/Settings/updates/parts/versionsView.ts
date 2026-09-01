import type { UpdateStatus } from "../../../../host";

/**
 * What the Versions page must SHOW — the decision, not the rendering.
 *
 * For the person using the app, "which version is running, on which channel, and here's
 * the published history" answers no question they're actually asking. The only one that matters
 * is "am I up to date?", and the app already answers that on its own. The
 * technical detail stays useful to US — on a staging build, where we switch from one channel
 * to another and pin a version.
 *
 * ⚠️ "up to date" is an ASSERTION, not a layout: it's only true if
 * the updater is at rest. As soon as it's checking, downloading, holding a build ready, or has
 * failed, that's what must be SAID — otherwise the page reassures while an update
 * is waiting, or worse, while it has failed.
 */

/** A staging build: that's where the technical detail is useful. */
export function isStagingBuild(
  current: { channel?: string } | null,
  channels: readonly { channel: string; env: string }[] = [],
): boolean {
  const ch = current?.channel?.toLowerCase() ?? "";
  if (!ch) return false;
  // The channel CARRIES the environment in its name (`desktop-staging`); the privileged
  // list, when present, decides better — it gives the published `env`.
  const known = channels.find((c) => c.channel.toLowerCase() === ch);
  if (known) return known.env.toLowerCase() !== "production";
  return ch.includes("staging") || ch.includes("dev") || ch.includes("beta");
}

export type VersionsView =
  /** Nothing more to say: « l'app est à jour ». */
  | { kind: "upToDate" }
  /** The updater is working (or failed): the status line takes over. */
  | { kind: "busy" }
  /** Staging build (or privileged device): all the technical detail. */
  | { kind: "technical" };

export function versionsView(
  status: UpdateStatus | null,
  opts: {
    current: { channel?: string } | null;
    channels?: readonly { channel: string; env: string }[];
    /** Device allowed to pin / switch environment: it needs the detail. */
    privileged?: boolean;
  },
): VersionsView {
  if (opts.privileged || isStagingBuild(opts.current, opts.channels)) return { kind: "technical" };
  // At rest ⇒ the short sentence. No state = the updater has nothing to report, and
  // "not-available" IS rest, right after a check.
  return !status || status.state === "not-available" ? { kind: "upToDate" } : { kind: "busy" };
}
