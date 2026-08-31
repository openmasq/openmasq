/**
 * Transport REFUSALS — reasons to send nothing that depend neither on
 * consent nor on configuration, but on the ENVIRONMENT the page runs in.
 *
 * Grouped here rather than lost in the middle of `sink.ts`: a reviewer should see the
 * family at a glance, and each one is a pure function of browser globals,
 * so directly testable (`sink.test.ts`).
 *
 * ⚠️ They all say NO the same way: positively. A condition we cannot
 * observe (no `navigator`, no `location`) is not a refusal — the opposite
 * would silence production the day a context doesn't expose one of the two, and a
 * missing measurement goes unnoticed.
 */

/** Do-Not-Track / Global Privacy Control: the person asked not to be tracked. */
export const dntEnabled = (): boolean => {
  try {
    const n = navigator as unknown as { doNotTrack?: string; globalPrivacyControl?: boolean };
    return n.doNotTrack === "1" || n.globalPrivacyControl === true;
  } catch {
    return false;
  }
};

/**
 * Is the page served from a developer's own machine?
 *
 * What this prevents: a `pnpm dev` left open all day, reloaded on every save,
 * counting the developer as a cohort in the product's numbers. Same intent
 * as suspending automated launches, but decided by the HOST — so nothing to
 * wire into each app.
 *
 * ⚠️ No `location` (server rendering, packaged desktop `file://`) ⇒ **we emit**. And the
 * test is on the WHOLE host or on a suffix: `localhost.example.fr` is a real
 * domain, not a loopback.
 */
export const isLoopbackHost = (): boolean => {
  try {
    const h = (location.hostname || "").toLowerCase();
    if (!h) return false;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "::1" ||
      h === "[::1]" ||
      h.endsWith(".localhost") ||
      // The name a Mac gives itself on the local network (`macbook.local`) — that's how one
      // opens a `pnpm dev` from a phone to test mobile rendering.
      h.endsWith(".local")
    );
  } catch {
    return false;
  }
};
