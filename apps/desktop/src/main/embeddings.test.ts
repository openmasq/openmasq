import { describe, it, expect, vi, afterEach } from "vitest";
import { embed } from "./embeddings";

/**
 * Audit M2 — `embed()` runs in the privileged MAIN process (outside the renderer CSP), so a
 * renderer-supplied `baseUrl` must be SSRF-gated: an internal/private host is refused BEFORE
 * any request (so the conversation/vault text can't be exfiltrated to it or used to probe
 * internal services), a loopback host (local Ollama/LM Studio) is allowed.
 */
const cfg = (baseUrl: string) => ({ model: "text-embedding-3-small", baseUrl });

afterEach(() => vi.unstubAllGlobals());

describe("embed() — SSRF-gated baseUrl (audit M2)", () => {
  it("REFUSES a cloud-metadata / link-local address (before any fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(embed(["x"], cfg("http://169.254.169.254/v1"))).rejects.toThrow(/private address/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("REFUSES a private LAN address", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(embed(["x"], cfg("http://10.0.0.5:8080/v1"))).rejects.toThrow(/private address/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("REFUSES a non-http(s) scheme", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(embed(["x"], cfg("file:///etc/passwd"))).rejects.toThrow(/non-http/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("REFUSES a malformed URL", async () => {
    await expect(embed(["x"], cfg("not a url"))).rejects.toThrow(/valid URL/i);
  });

  it("ALLOWS a loopback endpoint (local Ollama/LM Studio)", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: unknown) =>
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const out = await embed(["hello"], cfg("http://127.0.0.1:11434/v1"));
    expect(out).toEqual([[0.1, 0.2, 0.3]]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe("http://127.0.0.1:11434/v1/embeddings");
  });
});
