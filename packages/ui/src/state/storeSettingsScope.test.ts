import { describe, it, expect } from "vitest";
import { SETTINGS_KEY, settingsKeyFor } from "./storePersistence";

/**
 * Settings are ACCOUNT-scoped because `Settings.coffre` holds the user's REAL
 * sensitive values and `Settings.competences` their authored prompts. A shared
 * machine must never surface one account's to another.
 *
 * The hole this pins: the adopt effect re-scoped conversations, keys, the DB and MCP
 * — but never settings. The DB merge is a shallow `{...s, ...cleaned.settings}` that
 * does not fire at all for an account with no persisted row, so account A's coffre
 * stayed in memory, rendered on B's Coffre page, and B's next settings change wrote
 * A's PII into B's encrypted DB.
 */
describe("settingsKeyFor", () => {
  it("gives each account its own key", () => {
    expect(settingsKeyFor("user-a")).toBe(`${SETTINGS_KEY}:user-a`);
    expect(settingsKeyFor("user-b")).toBe(`${SETTINGS_KEY}:user-b`);
    expect(settingsKeyFor("user-a")).not.toBe(settingsKeyFor("user-b"));
  });

  // Unlike convKeyFor (which returns null when signed out — no store at all), settings
  // fall back to the device key: the app renders before auth resolves and must not lose
  // the theme on every cold start. That fallback is precisely why the adopt effect has
  // to OVERWRITE settings on switch rather than merge — see the store comment.
  it("falls back to the unscoped device key when signed out", () => {
    expect(settingsKeyFor(null)).toBe(SETTINGS_KEY);
  });

  it("a scoped key is never the device key, so B can't read the pre-auth blob", () => {
    expect(settingsKeyFor("user-a")).not.toBe(SETTINGS_KEY);
  });
});

describe("the account-switch contract (documents what store.ts must do)", () => {
  // The store loads `settingsKeyFor(userId)` over DEFAULT_SETTINGS on every switch.
  // Simulated here because the effect needs a full React+host harness; the property
  // that matters is that B's read never reaches A's key.
  it("account B reads B's key, which is empty when B has never saved", () => {
    const store: Record<string, string> = {
      [settingsKeyFor("user-a")]: JSON.stringify({ coffre: [{ value: "Léa Morvan" }] }),
    };
    const readFor = (uid: string) => JSON.parse(store[settingsKeyFor(uid)] ?? "{}");

    expect(readFor("user-a").coffre).toHaveLength(1);
    // B has no row ⇒ `{}` ⇒ the store falls back to DEFAULT_SETTINGS, NOT to A's memory.
    expect(readFor("user-b").coffre).toBeUndefined();
  });
});
