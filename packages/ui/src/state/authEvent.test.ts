import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveAuthEvent } from "./authEvent";
import type { AuthUser } from "../host";

const U: AuthUser = { id: "u1", email: "a@b.c" };

// `resolveAuthEvent` reads `navigator.onLine` for the `reconnecting` hint; pin it
// so the assertions don't depend on the test runner's ambient navigator.
function setOnline(online: boolean) {
  vi.stubGlobal("navigator", { onLine: online });
}
afterEach(() => vi.unstubAllGlobals());

describe("resolveAuthEvent", () => {
  it("trusts a truthy user verbatim without re-verifying", async () => {
    setOnline(true);
    const getSession = vi.fn(async () => null);
    const r = await resolveAuthEvent({ getSession }, U);
    expect(r).toEqual({ kind: "set", user: U, reconnecting: false });
    // A real sign-in/refresh needs no offline re-check.
    expect(getSession).not.toHaveBeenCalled();
  });

  it("RE-VERIFIES a null event via getSession (the offline-cold-start hole)", async () => {
    // The auth server is unreachable, so the host's getSession returns the cached
    // user. A null onChange (spurious SIGNED_OUT / unresolved INITIAL_SESSION) must
    // NOT sign out — it keeps the user the offline-tolerant getSession reports.
    setOnline(true);
    const getSession = vi.fn(async () => U);
    const r = await resolveAuthEvent({ getSession }, null);
    expect(getSession).toHaveBeenCalledOnce();
    expect(r).toEqual({ kind: "set", user: U, reconnecting: false });
  });

  it("flags reconnecting when the kept session was resolved offline", async () => {
    setOnline(false);
    const getSession = vi.fn(async () => U);
    const r = await resolveAuthEvent({ getSession }, null);
    expect(r).toEqual({ kind: "set", user: U, reconnecting: true });
  });

  it("signs out on a null event only when getSession confirms no session", async () => {
    setOnline(true);
    const getSession = vi.fn(async () => null);
    const r = await resolveAuthEvent({ getSession }, null);
    expect(r).toEqual({ kind: "set", user: null, reconnecting: false });
  });

  it("keeps the current user when getSession itself throws (transient)", async () => {
    const getSession = vi.fn(async () => {
      throw new Error("network");
    });
    const r = await resolveAuthEvent({ getSession }, null);
    expect(r).toEqual({ kind: "keep", reconnecting: true });
  });
});
