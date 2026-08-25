import { describe, it, expect } from "vitest";
import { ORG_PROFILE_KEY, orgProfileKeyFor } from "./orgProfileCache";
import { effectiveRedactCategories } from "../send/redactionOptions";

/**
 * The org policy must not be defeatable by making the org API unreachable.
 *
 * The hole: `getProfile().catch(() => setOrgProfile(null))` collapsed three states —
 * solo user / not yet loaded / fetch failed — into one. Every consumer reads
 * `orgProfile?.…`, so `null` meant "nothing enforced": mandated categories un-forced,
 * a suspended member allowed to send, a blocked model allowed, the reveal lock gone.
 * There was no retry, so one blip downgraded the member for the whole session — and a
 * member who simply blocked the host escaped the policy permanently, while the admin
 * console still reported it as enforced.
 *
 * The fix is a per-account cache of the last-known profile (the server is the only
 * writer) + a bounded retry. These pin the parts that are pure.
 */
describe("orgProfileKeyFor", () => {
  it("scopes the cached policy per account", () => {
    expect(orgProfileKeyFor("user-a")).toBe(`${ORG_PROFILE_KEY}:user-a`);
    expect(orgProfileKeyFor("user-a")).not.toBe(orgProfileKeyFor("user-b"));
  });

  it("has no cache when signed out (no account ⇒ no policy to remember)", () => {
    expect(orgProfileKeyFor(null)).toBeNull();
  });
});

describe("what a downgraded profile actually costs (why the cache exists)", () => {
  const globalOff = { email: false, name: false } as never;

  it("an org-forced category is ON even though the member turned it off locally", () => {
    const eff = effectiveRedactCategories(globalOff, undefined, ["email"]);
    expect(eff.email).toBe(true);
  });

  // This is the failure the cache prevents: with the profile downgraded to `null`,
  // `forcedCategories` is undefined and the member's local "off" wins — emails ship
  // in clear on every send, silently.
  it("REGRESSION: with no forced list, the member's local off wins and email leaks", () => {
    const eff = effectiveRedactCategories(globalOff, undefined, undefined);
    expect(eff.email).toBe(false);
  });

  it("a cached profile is a plain JSON round-trip (no secret, safe to persist)", () => {
    const profile = { blockedModelIds: ["gpt-4"], forcedCategories: ["email"], status: "active" };
    const restored = JSON.parse(JSON.stringify(profile));
    expect(effectiveRedactCategories(globalOff, undefined, restored.forcedCategories).email).toBe(true);
  });
});
