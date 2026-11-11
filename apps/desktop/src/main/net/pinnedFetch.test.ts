import { describe, expect, it, vi } from "vitest";
import { makePinnedFetch } from "./pinnedFetch";

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  redirect: unknown;
  dispatcher: unknown;
}

/** A fake network: `answers` by URL (a Response factory), every request recorded. */
function harness(answers: Record<string, () => Response>, privateHosts: string[] = []) {
  const seen: Seen[] = [];
  const pins: string[][] = [];
  let clock = 0;
  const assertPublic = vi.fn(async (url: string) => {
    const host = new URL(url).hostname;
    if (privateHosts.includes(host)) throw new Error(`Refused host resolving to a private address: ${host}`);
    return [`203.0.113.${host.length}`];
  });
  const fetchFn = vi.fn(async (input: unknown, init?: RequestInit & { dispatcher?: unknown }) => {
    const url = String(input);
    seen.push({
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body,
      redirect: init?.redirect,
      dispatcher: init?.dispatcher,
    });
    const make = answers[url];
    if (!make) throw new Error(`unexpected request to ${url}`);
    return make();
  });
  const fetch = makePinnedFetch("test", {
    assertPublic,
    pin: async (addrs) => {
      pins.push(addrs);
      return { addrs } as unknown as { close?: () => Promise<void> };
    },
    fetch: fetchFn as unknown as typeof globalThis.fetch,
    now: () => clock,
  });
  return { fetch, seen, pins, assertPublic, tick: (ms: number) => (clock += ms) };
}

const redirect = (status: number, location: string) => () => new Response(null, { status, headers: { location } });
const ok = (text = "ok") => () => new Response(text, { status: 200 });

describe("makePinnedFetch", () => {
  it("verifies the host and sends on a dispatcher pinned to the verified addresses, never following by itself", async () => {
    const h = harness({ "https://mcp.example/mcp": ok() });
    const res = await h.fetch("https://mcp.example/mcp", { method: "POST", body: "{}", headers: { authorization: "Bearer k" } });
    expect(await res.text()).toBe("ok");
    expect(h.assertPublic).toHaveBeenCalledWith("https://mcp.example/mcp", "test");
    expect(h.seen[0].redirect).toBe("manual");
    expect(h.seen[0].dispatcher).toEqual({ addrs: h.pins[0] });
    expect(h.seen[0].headers.authorization).toBe("Bearer k");
  });

  it("refuses a host that resolves private, before any byte leaves (the rebinding answer)", async () => {
    const h = harness({}, ["mcp.example"]);
    await expect(h.fetch("https://mcp.example/mcp")).rejects.toThrow(/private address/);
    expect(h.seen).toHaveLength(0);
  });

  it("refuses the OAuth endpoint a server names on a private host", async () => {
    // the server's metadata said: token_endpoint = https://intranet.corp/token
    const h = harness({}, ["intranet.corp"]);
    await expect(h.fetch("https://intranet.corp/token", { method: "POST", body: "grant_type=refresh_token" })).rejects.toThrow(/private address/);
    expect(h.seen).toHaveLength(0);
  });

  it("refuses anything but https, and a URL carrying credentials", async () => {
    const h = harness({});
    await expect(h.fetch("http://mcp.example/mcp")).rejects.toThrow(/non-https/);
    await expect(h.fetch("https://user:pw@mcp.example/mcp")).rejects.toThrow(/inline credentials/);
    expect(h.assertPublic).not.toHaveBeenCalled();
  });

  it("re-verifies a redirect hop and refuses one that lands on a private host", async () => {
    const h = harness({ "https://mcp.example/mcp": redirect(307, "https://metadata.internal/latest") }, ["metadata.internal"]);
    await expect(h.fetch("https://mcp.example/mcp", { method: "POST", body: "{}" })).rejects.toThrow(/private address/);
    expect(h.seen.map((s) => s.url)).toEqual(["https://mcp.example/mcp"]);
  });

  it("never carries a bearer, a cookie or an unknown header to another origin", async () => {
    const h = harness({
      "https://mcp.example/mcp": redirect(307, "https://elsewhere.example/collect"),
      "https://elsewhere.example/collect": ok(),
    });
    await h.fetch("https://mcp.example/mcp", {
      method: "POST",
      body: "{}",
      headers: { Authorization: "Bearer k", Cookie: "a=b", "X-Api-Key": "k", "Mcp-Session-Id": "s", "Content-Type": "application/json", Accept: "text/event-stream" },
    });
    expect(h.seen[1].headers).toEqual({ "content-type": "application/json", accept: "text/event-stream" });
    expect(h.seen[1].method).toBe("POST");
    expect(h.seen[1].body).toBe("{}");
  });

  it("keeps the headers on a same-origin redirect (a trailing slash is not an exit)", async () => {
    const h = harness({ "https://mcp.example/mcp": redirect(308, "/mcp/"), "https://mcp.example/mcp/": ok() });
    await h.fetch("https://mcp.example/mcp", { method: "POST", body: "{}", headers: { authorization: "Bearer k" } });
    expect(h.seen[1].headers.authorization).toBe("Bearer k");
    // one verification for the host: the second hop reuses the pin
    expect(h.assertPublic).toHaveBeenCalledTimes(1);
  });

  it("turns a 303 (and a 302 of a POST) into a GET without the body", async () => {
    const h = harness({ "https://mcp.example/a": redirect(303, "/b"), "https://mcp.example/b": ok() });
    await h.fetch("https://mcp.example/a", { method: "POST", body: "secret", headers: { "content-type": "text/plain" } });
    expect(h.seen[1].method).toBe("GET");
    expect(h.seen[1].body).toBeUndefined();
    expect(h.seen[1].headers["content-type"]).toBeUndefined();
  });

  it("refuses to follow when the body cannot be sent again, and stops a redirect loop", async () => {
    const h = harness({ "https://mcp.example/a": redirect(307, "/a") });
    const stream = new ReadableStream();
    await expect(h.fetch("https://mcp.example/a", { method: "POST", body: stream, duplex: "half" } as RequestInit)).rejects.toThrow(/cannot be sent again/);
    await expect(h.fetch("https://mcp.example/a", { method: "POST", body: "{}" })).rejects.toThrow(/Too many redirects/);
  });

  it("verifies a host again once its window has passed", async () => {
    const h = harness({ "https://mcp.example/mcp": ok() });
    await h.fetch("https://mcp.example/mcp");
    await h.fetch("https://mcp.example/mcp");
    expect(h.assertPublic).toHaveBeenCalledTimes(1);
    h.tick(31_000);
    await h.fetch("https://mcp.example/mcp");
    expect(h.assertPublic).toHaveBeenCalledTimes(2);
  });
});

describe("pinnedDispatcher", () => {
  it("refuses to hand back nothing: no verified address means no fetch", async () => {
    const { pinnedDispatcher } = await import("./net");
    await expect(pinnedDispatcher([])).rejects.toThrow(/no verified address/);
    const d = await pinnedDispatcher(["203.0.113.7"]);
    expect(d).toBeTruthy();
    await d.close?.();
  });
});
