import { describe, it, expect, vi, afterEach } from "vitest";
import { createSink } from "./index";

/**
 * An event is dated when it HAPPENED, not when it leaves. Two queues sit between the two:
 * desktop main holding reports while no window listens (`at` from the caller), and the
 * pre-consent queue here (the sink's own arrival time). Dated at send, both collapse hours
 * of a periodic event into one burst at the moment the queue drains.
 */
const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));

function wire(consent = true) {
  const fetchFn = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true }));
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("location", undefined);
  const s = createSink({ getAnonId: () => "anon-x", defaultSource: "test" });
  s.configureAnalytics({ relayUrl: "https://relay.test/e" });
  if (consent) s.setAnalyticsConsent(true);
  const sentTs = () => fetchFn.mock.calls.map(([, init]) => (JSON.parse(init.body) as { ts: number }).ts);
  return { s, sentTs };
}

const T0 = 1_760_000_000_000;

describe("the envelope's `ts` is the event's own time", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a caller-supplied past `at` is forwarded as is", async () => {
    vi.spyOn(Date, "now").mockReturnValue(T0);
    const { s, sentTs } = wire();
    s.sink({ name: "update_check", props: {}, at: T0 - 3_600_000 });
    s.captureError({ scope: "updates", code: "download-500", at: T0 - 60_000 });
    await flush();
    expect(sentTs()).toEqual([T0 - 3_600_000, T0 - 60_000]);
  });

  it("a future or absurd `at` is never trusted: the sink stamps now", async () => {
    vi.spyOn(Date, "now").mockReturnValue(T0);
    const { s, sentTs } = wire();
    s.sink({ name: "a", props: {}, at: T0 + 1 });
    s.sink({ name: "b", props: {}, at: Number.NaN });
    s.sink({ name: "c", props: {}, at: -5 });
    await flush();
    expect(sentTs()).toEqual([T0, T0, T0]);
  });

  it("an event held for consent keeps the time it was captured, not the decision's", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(T0);
    const { s, sentTs } = wire(false);
    s.sink({ name: "app_open", props: {} });
    now.mockReturnValue(T0 + 90_000);
    s.setAnalyticsConsent(true);
    await flush();
    expect(sentTs()).toEqual([T0]);
  });
});
