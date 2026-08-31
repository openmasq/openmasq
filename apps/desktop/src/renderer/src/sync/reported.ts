import { reportedLedger } from "@openmasq/sync";
import { BRAND } from "@openmasq/branding";
import { authHost } from "../auth";

/**
 * The dedup ledger for organization audit — PER ACCOUNT and WITHOUT plaintext
 * values. Since an organization's facts table is append-only, a redacted value
 * must be counted only once; this ledger records what has already been counted.
 *
 * ⚠️ It used to live under ONE device key and stored the ORIGINALS. Two flaws:
 * what account A had reported prevented B's organization from counting its own,
 * and real PII sat in plaintext in localStorage — Chromium LevelDB on disk,
 * precisely the place from which the sync passphrase and the device secret were
 * removed. The policy (salted hash, per-account key, plaintext migration on
 * first load) lives in `@openmasq/sync` `reportedLedger`, shared with mobile
 * and the extension and tested there.
 */
const ledger = reportedLedger({
  store: {
    get: async (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* quota / storage unavailable — the delta will simply be re-reported */
      }
    },
    remove: async (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  },
  legacyKey: `${BRAND.slug}:sync-reported`,
  // The token's `sub`, decoded WITHOUT verification: here it's a local locker name,
  // never an authority — the identity that matters is the one the backend re-derives from the token.
  accountId: async () => {
    try {
      const token = await authHost.getAccessToken?.();
      if (!token) return null;
      const payload = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ) as { sub?: string };
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  },
});

export const openReported = (): ReturnType<typeof ledger.open> => ledger.open();
