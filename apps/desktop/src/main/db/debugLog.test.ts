import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "./schema";

// Real in-memory libSQL (same harness as conversations.test.ts): the round-trip
// exercises the actual SQL against the actual schema — the `settings` KV row this
// rides on must exist and upsert correctly, not just typecheck.
let client: Client;
// Mirrors the two things the module asks the connection: the handle, and whether the bytes
// on disk are encrypted. `packaged` is mutable so both builds can be exercised.
let encrypted = true;
const packaged = { value: false };
vi.mock("./connection", () => ({ getClient: () => client, isDbEncrypted: () => encrypted }));
vi.mock("electron", () => ({ app: { get isPackaged() { return packaged.value; } } }));

const { dbSaveDebugLog, dbLoadDebugLog } = await import("./debugLog");

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await migrate(client);
  encrypted = true;
  packaged.value = false;
});

describe("debug journal persistence (settings KV row)", () => {
  it("round-trips the ring blob, replace-on-save", async () => {
    await dbSaveDebugLog('[{"id":"d1"}]');
    await dbSaveDebugLog('[{"id":"d1"},{"id":"d2"}]');
    expect(await dbLoadDebugLog()).toBe('[{"id":"d1"},{"id":"d2"}]');
  });

  it("returns null when nothing was stored", async () => {
    expect(await dbLoadDebugLog()).toBeNull();
  });

  it("never collides with the app settings row", async () => {
    await client.execute(
      "INSERT INTO settings (key, value, created_at, updated_at) VALUES ('app', '{\"a\":1}', 1, 1)",
    );
    await dbSaveDebugLog("[]");
    const app = await client.execute("SELECT value FROM settings WHERE key = 'app'");
    expect(app.rows[0]?.value).toBe('{"a":1}');
    expect(await dbLoadDebugLog()).toBe("[]");
  });

  it("refuses a runaway blob (fail closed on size, keeps the previous ring)", async () => {
    await dbSaveDebugLog("[]");
    await dbSaveDebugLog("x".repeat(9_000_000));
    expect(await dbLoadDebugLog()).toBe("[]");
  });
});

/* The module's own rule: the journal holds WIRE TEXT and VAULT VALUES — real PII — so its
   only allowed home at rest is the encrypted per-account DB. Nothing checked it. A packaged
   build whose keychain is unreachable opens the DB in CLEARTEXT on purpose so the user keeps
   their chats (`store/dbCrypto.ts` audit H1) — and the journal rode along, in the clear. */
describe("a plaintext DB is not a home for the debug journal", () => {
  it("DROPS the save in a packaged build whose DB opened unencrypted", async () => {
    packaged.value = true;
    encrypted = false;
    await dbSaveDebugLog('[{"id":"d1","wire":"Jean Dupont, 06 12 34 56 78"}]');
    expect(await dbLoadDebugLog()).toBeNull(); // nothing reached the disk
  });

  it("keeps a previously-stored ring rather than overwriting it", async () => {
    packaged.value = true;
    await dbSaveDebugLog('[{"id":"ok"}]'); // encrypted: stored
    encrypted = false; // the keychain goes away mid-session
    await dbSaveDebugLog('[{"id":"pii"}]');
    expect(await dbLoadDebugLog()).toBe('[{"id":"ok"}]');
  });

  it("still saves in a packaged build with an encrypted DB", async () => {
    packaged.value = true;
    await dbSaveDebugLog('[{"id":"d1"}]');
    expect(await dbLoadDebugLog()).toBe('[{"id":"d1"}]');
  });

  it("leaves DEV alone — plaintext there is deliberate, and the data is the developer's own", async () => {
    packaged.value = false;
    encrypted = false;
    await dbSaveDebugLog('[{"id":"dev"}]');
    expect(await dbLoadDebugLog()).toBe('[{"id":"dev"}]');
  });
});
