/**
 * "This MCP server is DEAD" — the fact, in ONE place.
 *
 * The SDK doesn't model a transport's death: it signals it by THROWING, and always with
 * one of these two texts. Two distinct decisions depend on it, and they must speak of
 * the same set:
 *  • the connection's owner EVICTS the server instead of continuing to poll it
 *    (`apps/desktop` `refreshRoutes`);
 *  • the error channels don't report the failure (it's a remote connector gone down or
 *    a child that exited, not a code bug).
 *
 * ⚠️ The second necessarily lives elsewhere: `@openmasq/analytics` is DEPENDENCY-FREE by
 * contract, it cannot import this package. Its list is therefore broader (network, auth
 * refusal…) and the inclusion of both messages below is held by a TEST that reads both —
 * `packages/ui/src/analytics/deadTransportParity.test.ts`, the only consumer of the
 * two packages. A comment cannot fail in CI (rule 9).
 *
 * The text is the SDK's, not ours: hardening it into a greedy `RegExp` would gut the
 * distinction that matters. A `spawn ENOENT` or a "cannot find module" is a PACKAGING
 * regression, it must keep surfacing.
 */

/** The messages by which the SDK says there's no one left on the other end. */
export const DEAD_TRANSPORT_MESSAGES = ["not connected", "connection closed"] as const;

/**
 * Does the error say the transport is dead? Loose on the FORM (an `Error`, an
 * `McpError`, a string — the SDK throws all three depending on the path), strict on the SUBSTANCE.
 */
export function isDeadTransport(err: unknown): boolean {
  const text = (
    err instanceof Error ? err.message : typeof err === "string" ? err : ""
  ).toLowerCase();
  if (!text) return false;
  return DEAD_TRANSPORT_MESSAGES.some((m) => text.includes(m));
}
