import { describe, expect, it } from "vitest";
import {
  BILLING_GATED_SERVICES,
  billingEnabled,
  mainDefines,
  rendererDefines,
  serviceDefines,
} from "./buildDefines";

/** A "complete" build: everything a CI could supply. */
const FULL: NodeJS.ProcessEnv = {
  OPENMASQ_BACKEND_URL: "https://api.example",
  OPENMASQ_BACKEND_URL_STAGING: "https://api-staging.example",
  OPENMASQ_GATEWAY_URL: "https://gw.example",
  OPENMASQ_GATEWAY_URL_STAGING: "https://gw-staging.example",
  OPENMASQ_SUPABASE_URL: "https://ref.supabase.co",
  OPENMASQ_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  OPENMASQ_AUTH_URL: "https://auth.example",
  OPENMASQ_SENTRY_DSN: "https://k@o.ingest.sentry.io/1",
  OPENMASQ_ALLOW_CUSTOM_STACK: "1",
  VITE_UPDATES_URL: "https://updates.example",
};

const lit = (defs: Record<string, string>, name: string): string =>
  JSON.parse(defs[`process.env.${name}`]);

describe("OPENMASQ_BILLING — la porte des services distants", () => {
  it("⛔ FERMÉE par défaut : l'API et la passerelle sont cuites vides même si le build les a reçues", () => {
    expect(billingEnabled(FULL)).toBe(false);
    const defs = serviceDefines(FULL);
    for (const name of BILLING_GATED_SERVICES) expect(lit(defs, name), name).toBe("");
    expect(lit(defs, "OPENMASQ_BILLING")).toBe("");
  });

  it('OUVERTE (`"1"`) : les quatre adresses passent telles quelles', () => {
    const env = { ...FULL, OPENMASQ_BILLING: "1" };
    expect(billingEnabled(env)).toBe(true);
    const defs = serviceDefines(env);
    for (const name of BILLING_GATED_SERVICES) expect(lit(defs, name), name).toBe(FULL[name]);
    expect(lit(defs, "OPENMASQ_BILLING")).toBe("1");
  });

  it('seul `"1"` ouvre — pas `true`, pas `yes`', () => {
    for (const v of ["true", "yes", "on", "0", ""]) {
      expect(billingEnabled({ ...FULL, OPENMASQ_BILLING: v }), v).toBe(false);
    }
  });

  it("ne ferme QUE l'API et la passerelle : auth Supabase, relais Slack, Sentry, pile saisie restent sur leurs variables", () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, FULL);
      delete process.env.OPENMASQ_BILLING;
      const main = mainDefines();
      const renderer = rendererDefines("0.0.0");
      for (const defs of [main, renderer]) {
        expect(lit(defs, "OPENMASQ_SUPABASE_URL")).toBe(FULL.OPENMASQ_SUPABASE_URL);
        expect(lit(defs, "OPENMASQ_SUPABASE_PUBLISHABLE_KEY")).toBe(
          FULL.OPENMASQ_SUPABASE_PUBLISHABLE_KEY,
        );
        expect(lit(defs, "OPENMASQ_SENTRY_DSN")).toBe(FULL.OPENMASQ_SENTRY_DSN);
        expect(lit(defs, "OPENMASQ_ALLOW_CUSTOM_STACK")).toBe("1");
        expect(lit(defs, "OPENMASQ_BACKEND_URL")).toBe("");
        expect(lit(defs, "OPENMASQ_GATEWAY_URL")).toBe("");
      }
      expect(lit(main, "OPENMASQ_AUTH_URL")).toBe(FULL.OPENMASQ_AUTH_URL);
      expect(JSON.parse(main["process.env.VITE_UPDATES_URL"])).toBe(FULL.VITE_UPDATES_URL);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });
});
