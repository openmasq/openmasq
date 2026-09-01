import { describe, expect, it } from "vitest";
import { BILLING_GATED_SERVICES } from "./buildDefines";
import {
  applyPublicServiceDefaults,
  PUBLIC_SERVICE_NAMES,
  publicServiceDefaults,
} from "./publicServices";

/**
 * The public defaults: what a build from the sources reaches with NO CI. What these cases
 * hold:
 *  1. only ABSENT variables receive a default — a variable set EMPTY is an opt-out, not an
 *     oversight;
 *  2. nothing applies in dev (dev talks to LOCAL services, never to production);
 *  3. the list can never name an address behind the BILLING gate — this repository has no
 *     backend, and a default here would invent one for it;
 *  4. the relays derive from the brand domain (one home for that fact).
 */
describe("applyPublicServiceDefaults", () => {
  const opts = { brandDomain: "example.test", dev: false };

  it("fills the absent variables and nothing else", () => {
    const env: NodeJS.ProcessEnv = { OPENMASQ_AUTH_URL: "https://mine.example" };
    const applied = applyPublicServiceDefaults(env, opts);
    expect(env.OPENMASQ_AUTH_URL).toBe("https://mine.example");
    expect(applied.OPENMASQ_AUTH_URL).toBeUndefined();
    expect(env.VITE_ANALYTICS_RELAY_URL).toBe("https://analytics.example.test/e");
    expect(env.OPENMASQ_SUPABASE_URL).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
    // A DSN: public key @ ingest host / project id — a client can only SEND with it.
    expect(env.OPENMASQ_SENTRY_DSN).toMatch(
      /^https:\/\/[0-9a-f]+@o\d+\.ingest\.[a-z.]+sentry\.io\/\d+$/,
    );
  });

  it("a variable set EMPTY is an opt-out: it stays empty", () => {
    const env: NodeJS.ProcessEnv = { VITE_ANALYTICS_RELAY_URL: "", OPENMASQ_AUTH_URL: "" };
    applyPublicServiceDefaults(env, opts);
    expect(env.VITE_ANALYTICS_RELAY_URL).toBe("");
    expect(env.OPENMASQ_AUTH_URL).toBe("");
  });

  it("applies NOTHING in dev", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(applyPublicServiceDefaults(env, { ...opts, dev: true })).toEqual({});
    expect(Object.keys(env)).toEqual([]);
  });

  it("⛔ never names an address behind the BILLING gate", () => {
    for (const gated of BILLING_GATED_SERVICES) {
      expect(PUBLIC_SERVICE_NAMES as readonly string[]).not.toContain(gated);
    }
  });

  it("the relays follow the brand domain", () => {
    const d = publicServiceDefaults("openmasq.com");
    expect(d.OPENMASQ_AUTH_URL).toBe("https://auth.openmasq.com");
    expect(d.VITE_ANALYTICS_RELAY_URL).toBe("https://analytics.openmasq.com/e");
  });
});
