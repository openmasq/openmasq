import { describe, it, expect, beforeEach } from "vitest";
import {
  attachEgressSink,
  flushEgressJournal,
  listEgress,
  noteEgress,
  noteEgressUrl,
  originOf,
  resetEgressJournalForTest,
  type EgressRecord,
} from "./egressJournal";

beforeEach(() => resetEgressJournalForTest());

describe("originOf — the record must not carry a secret", () => {
  it("keeps scheme + host and DROPS the path and query", () => {
    // The whole reason this journal stores an origin and not a URL: a signed export URL
    // carries its token in the query string, and the journal persists.
    expect(originOf("https://files.example.com/export/abc?token=SECRET&sig=xyz")).toBe(
      "https://files.example.com",
    );
  });

  it("keeps a NON-default port, drops a default one", () => {
    expect(originOf("https://example.com:8443/x")).toBe("https://example.com:8443");
    expect(originOf("https://example.com:443/x")).toBe("https://example.com");
    expect(originOf("http://example.com:80/x")).toBe("http://example.com");
  });

  it("drops embedded credentials rather than journalling them", () => {
    expect(originOf("https://user:pass@example.com/x")).toBe("https://example.com");
  });

  it("lower-cases the host so one site is one row", () => {
    expect(originOf("https://Example.COM/x")).toBe("https://example.com");
  });

  it("returns null for a non-http(s) or unparseable target", () => {
    expect(originOf("file:///etc/passwd")).toBeNull();
    expect(originOf("data:text/html,<script>")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});

describe("noteEgressUrl", () => {
  it("records an allow and a refusal, newest first", () => {
    noteEgressUrl("https://a.example.com/p?q=1", "connector", "allowed");
    noteEgressUrl("http://169.254.169.254/latest/meta-data", "browser", "refused", "non-public host");
    const rows = listEgress();
    expect(rows.map((r) => r.origin)).toEqual(["http://169.254.169.254", "https://a.example.com"]);
    expect(rows[0]).toMatchObject({ verdict: "refused", source: "browser", reason: "non-public host" });
    expect(rows[1]).toMatchObject({ verdict: "allowed", source: "connector" });
  });

  it("does not journal a target it cannot reduce to an origin", () => {
    noteEgressUrl("file:///etc/passwd", "connector", "refused");
    expect(listEgress()).toHaveLength(0);
  });

  it("filters by verdict and by source", () => {
    noteEgressUrl("https://a.example.com/", "connector", "allowed");
    noteEgressUrl("https://b.example.com/", "browser", "refused", "non-public host");
    expect(listEgress({ verdict: "refused" }).map((r) => r.origin)).toEqual(["https://b.example.com"]);
    expect(listEgress({ source: "connector" }).map((r) => r.origin)).toEqual(["https://a.example.com"]);
  });
});

describe("per-account isolation", () => {
  it("RESETS the ring when the account changes — one account's hosts never reach the next", async () => {
    const saved: EgressRecord[][] = [];
    await attachEgressSink({
      load: async () => [],
      save: async (rows) => {
        saved.push(rows);
      },
    });
    noteEgress({ origin: "https://alice-bank.example", source: "browser", verdict: "allowed" });
    expect(listEgress()).toHaveLength(1);

    // Signing out detaches; the ring must be empty before anything else is recorded.
    await attachEgressSink(null);
    expect(listEgress()).toHaveLength(0);

    // …and the outgoing account's rows were flushed to ITS OWN sink, not the next one's.
    expect(saved.at(-1)?.map((r) => r.origin)).toEqual(["https://alice-bank.example"]);

    await attachEgressSink({ load: async () => [], save: async () => {} });
    expect(listEgress()).toHaveLength(0);
  });

  it("hydrates the ring from the account's store on attach", async () => {
    await attachEgressSink({
      load: async () => [
        { at: 1, origin: "https://old.example", source: "connector", verdict: "allowed" },
      ],
      save: async () => {},
    });
    expect(listEgress().map((r) => r.origin)).toEqual(["https://old.example"]);
  });

  it("survives a store that throws — a broken journal is an empty journal, never a crash", async () => {
    await expect(
      attachEgressSink({
        load: async () => {
          throw new Error("db closed");
        },
        save: async () => {
          throw new Error("db closed");
        },
      }),
    ).resolves.toBeUndefined();
    noteEgress({ origin: "https://x.example", source: "connector", verdict: "allowed" });
    await expect(flushEgressJournal()).resolves.toBeUndefined();
    expect(listEgress()).toHaveLength(1);
  });
});
