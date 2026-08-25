import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ToolTimeoutError,
  toolTimeoutMs,
  formatElapsed,
  liveToolStatus,
  watchToolCall,
} from "./mcpAgentWatchdog";
import { classifyToolError } from "./toolFault";
import { raceAbort } from "./mcpAgentAbort";

describe("toolTimeoutMs — per-class budgets", () => {
  it("browser navigation (and tabs — opening a tab must not dodge the class) gets the nav budget", () => {
    expect(toolTimeoutMs("browser__browser_navigate")).toBe(90_000);
    expect(toolTimeoutMs("browser__browser_tabs")).toBe(90_000);
    // Third-party browser connectors share the convention (like isBrowser).
    expect(toolTimeoutMs("browsermcp__browser_navigate")).toBe(90_000);
  });

  it("other browser tools get the shorter on-page budget", () => {
    expect(toolTimeoutMs("browser__browser_click")).toBe(60_000);
    expect(toolTimeoutMs("browser__browser_snapshot")).toBe(60_000);
  });

  it("ordinary connector tools get the generous default", () => {
    expect(toolTimeoutMs("gmail__send_email")).toBe(120_000);
    expect(toolTimeoutMs("firecrawl__firecrawl_scrape")).toBe(120_000);
    expect(toolTimeoutMs("load_tools")).toBe(120_000);
  });
});

describe("formatElapsed / liveToolStatus", () => {
  it("formats under and over a minute", () => {
    expect(formatElapsed(47_000)).toBe("47 s");
    expect(formatElapsed(125_000)).toBe("2 min 05");
  });

  it("composes narration + elapsed, and warns once 60% of the budget is burned", () => {
    expect(liveToolStatus("Recherche LinkedIn", 25_000, 90_000)).toBe("Recherche LinkedIn · 25 s");
    expect(liveToolStatus(undefined, 10_000, 90_000)).toBe("en cours · 10 s");
    expect(liveToolStatus("Recherche LinkedIn", 60_000, 90_000)).toBe(
      "Recherche LinkedIn · 1 min 00 · réponse lente",
    );
  });
});

describe("watchToolCall", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the work's value and stops ticking after the win", async () => {
    const ticks: number[] = [];
    let resolveWork!: (v: string) => void;
    const p = watchToolCall(new Promise<string>((r) => (resolveWork = r)), {
      bareTool: "browser_navigate",
      timeoutMs: 90_000,
      tickMs: 5_000,
      onTick: (ms) => ticks.push(ms),
    });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(ticks.length).toBe(2); // 5s, 10s
    resolveWork("ok");
    await expect(p).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ticks.length).toBe(2); // no tick after settle
  });

  it("rejects with ToolTimeoutError at the hard budget — and classifyToolError maps it to `transport`", async () => {
    const p = watchToolCall(new Promise<never>(() => {}), {
      bareTool: "browser_navigate",
      timeoutMs: 90_000,
    });
    const caught = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(90_000);
    const err = await caught;
    expect(err).toBeInstanceOf(ToolTimeoutError);
    // The whole point: the timeout feeds the EXISTING dead-end machinery.
    expect(classifyToolError((err as Error).message)).toBe("transport");
    // And the message is wire-safe: tool name + duration, nothing else.
    expect((err as Error).message).toBe("Délai dépassé : `browser_navigate` n'a pas répondu en 90 s.");
  });

  it("a work rejection wins over the timeout and passes through unchanged", async () => {
    const boom = new Error("ECONNREFUSED");
    const p = watchToolCall(Promise.reject(boom), { bareTool: "t", timeoutMs: 90_000 });
    await expect(p).rejects.toBe(boom);
  });

  it("work settling AFTER the timeout is observed (no unhandled rejection) and ticks stop", async () => {
    const ticks: number[] = [];
    let rejectWork!: (e: Error) => void;
    const p = watchToolCall(new Promise<never>((_, rej) => (rejectWork = rej)), {
      bareTool: "t",
      timeoutMs: 10_000,
      tickMs: 5_000,
      onTick: (ms) => ticks.push(ms),
    });
    const caught = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await caught).toBeInstanceOf(ToolTimeoutError);
    const before = ticks.length;
    rejectWork(new Error("late loser")); // must be swallowed by the settled watchdog
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ticks.length).toBe(before);
  });

  it("composes with raceAbort: Stop still wins immediately over a slow call", async () => {
    const ctrl = new AbortController();
    const p = raceAbort(
      watchToolCall(new Promise<never>(() => {}), { bareTool: "t", timeoutMs: 90_000 }),
      ctrl.signal,
    );
    const caught = p.catch((e) => e);
    ctrl.abort();
    const err = await caught;
    expect((err as { name?: string }).name).toBe("AbortError");
  });
});

describe("classifyToolError — the messages main actually throws", () => {
  it("maps the main-side write refusal to `operational` (was `unknown` → the model looped the dialog)", () => {
    expect(
      classifyToolError("Action d'écriture refusée par l'utilisateur : gmail__send_email. Ne relance pas cette écriture."),
    ).toBe("operational");
  });

  it("maps the DNS-outage navigation error to `transport` (retryable), not a dead end", () => {
    expect(
      classifyToolError("Navigation impossible : réseau ou DNS injoignable (etfdb.com). Vérifie la connexion, puis réessaie."),
    ).toBe("transport");
    expect(
      classifyToolError("Réseau ou DNS injoignable pour ce connecteur — réessaie dans un instant."),
    ).toBe("transport");
  });

  it("keeps the SSRF refusal `operational` — a genuine block must not read as retryable", () => {
    expect(
      classifyToolError("Navigation bloquée (adresse interne/privée) : https://169.254.169.254/"),
    ).toBe("operational");
  });
});
