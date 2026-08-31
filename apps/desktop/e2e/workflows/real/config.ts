/*
 * Env + harness for the REAL suite (`../../workflows-real.e2e.ts`): the dev
 * account's REAL connectors, not the fixtures. How that's possible without interactive
 * OAuth: MCP tokens live PER ACCOUNT in the app's profile
 * (`accounts/mcp-<uid>.json`, values encrypted via `safeStorage` → macOS Keychain,
 * decryptable by the same Electron binary). We COPY this file from the dev profile
 * into the test profile (same pattern as `e2e:login` copying cookies), we
 * seed a session whose `user.id` is the REAL uid, and `mcp:set-user` →
 * `mcpReconnectStored` silently reconnects every stored connector.
 * So the app DOES need to be LAUNCHED (headless): outside Electron the tokens are
 * undecryptable and the write gate doesn't exist — and it's the gate we're testing.
 *
 * The harness is a FOLDER (rule 1): `config` (what we're targeting), `launch` (profile
 * adopted + session seeded), `turn` (waiting for/diagnosing a turn), `gate` (the
 * MCP bridge + the non-spoofable window's approver).
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { BRAND } from "@openmasq/branding";

export const REAL = process.env.E2E_REAL === "1";
/** PAID model required for this suite (the tofix folder's failures were
 *  observed on it) — a few cents per run, never in CI. */
export const REAL_MODEL = process.env.E2E_REAL_MODEL || "poolside/laguna-xs-2.1";
/** The targeted dev account: the one whose profile's MCP store carries the connectors.
 *
 *  ⚠️ **No hardcoded default, and that's deliberate.** This repo is public: a Supabase uid
 *  and an address written here would designate a REAL production account, which anyone cloning
 *  it would inherit as a target. Both come from the environment, and their absence STOPS the
 *  suite (see below) rather than letting it target someone else's account. */
export const REAL_UID = process.env.E2E_REAL_UID ?? "";
/** This same account's address — serves as a PII sentinel and seeds the seeded session. */
export const REAL_EMAIL = process.env.E2E_REAL_EMAIL ?? "";
/** The profile that HOLDS the connections (the dev app on this machine). */
export const REAL_PROFILE =
  process.env.E2E_REAL_PROFILE || resolve(homedir(), `Library/Application Support/${BRAND.name} (Dev)`);
/** PII sentinels: REAL values known to the dev account/tenant that must
 *  NEVER appear on the wire (re-redacted tool results).
 *  Extensible via env (comma-separated list). */
export const REAL_PII = [
  ...(REAL_EMAIL ? [REAL_EMAIL] : []),
  ...(process.env.E2E_REAL_PII ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

// Fail closed, and EARLY: without an explicit target the suite must not start. A silent run
// targeting a default uid would copy the MCP store of an account that isn't yours.
if (REAL && (!REAL_UID || !REAL_EMAIL)) {
  throw new Error(
    "E2E_REAL=1 exige E2E_REAL_UID (l'uid Supabase du compte dev) et E2E_REAL_EMAIL " +
      "(son adresse) — aucune valeur par défaut n'est écrite dans ce dépôt.",
  );
}

export const realStoreSource = (): string =>
  resolve(REAL_PROFILE, "accounts", `mcp-${REAL_UID}.json`);
