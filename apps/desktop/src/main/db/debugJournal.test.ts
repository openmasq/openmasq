import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "./schema";

// Real in-memory libSQL (same harness as conversations.test.ts): the round-trip
// exercises the actual SQL against the actual schema — the `settings` KV row this
// rides on must exist and upsert correctly, not just typecheck.
let client: Client;
vi.mock("./connection", () => ({ getClient: () => client }));

const { dbSaveDebugJournal, dbLoadDebugJournal } = await import("./debugJournal");

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await migrate(client);
});

describe("debug journal persistence (settings KV row)", () => {
  it("round-trips the ring blob, replace-on-save", async () => {
    await dbSaveDebugJournal('[{"id":"d1"}]');
    await dbSaveDebugJournal('[{"id":"d1"},{"id":"d2"}]');
    expect(await dbLoadDebugJournal()).toBe('[{"id":"d1"},{"id":"d2"}]');
  });

  it("returns null when nothing was stored", async () => {
    expect(await dbLoadDebugJournal()).toBeNull();
  });

  it("never collides with the app settings row", async () => {
    await client.execute(
      "INSERT INTO settings (key, value, created_at, updated_at) VALUES ('app', '{\"a\":1}', 1, 1)",
    );
    await dbSaveDebugJournal("[]");
    const app = await client.execute("SELECT value FROM settings WHERE key = 'app'");
    expect(app.rows[0]?.value).toBe('{"a":1}');
    expect(await dbLoadDebugJournal()).toBe("[]");
  });

  it("refuses a runaway blob (fail closed on size, keeps the previous ring)", async () => {
    await dbSaveDebugJournal("[]");
    await dbSaveDebugJournal("x".repeat(9_000_000));
    expect(await dbLoadDebugJournal()).toBe("[]");
  });
});
