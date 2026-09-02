// Pins the host gate of the local-endpoint probe and model listing: a LAN box IS
// reachable (the send would serve it), link-local / metadata NEVER is, a public host
// must resolve public, and the listing stays bounded data.
import { afterEach, describe, expect, it, vi } from "vitest";
import { listEndpointModels, parseModelIds, probeEndpoint } from "./localEndpoint";

afterEach(() => vi.unstubAllGlobals());

const okModels = (ids: string[]) =>
  vi.fn(async (_url: string, _init?: unknown) =>
    new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 }),
  );

describe("probeEndpoint — host gate", () => {
  it("SONDE une adresse LAN privée (192.168.x) — l'envoi la sert déjà", async () => {
    const f = okModels(["x"]);
    vi.stubGlobal("fetch", f);
    await expect(probeEndpoint("http://192.168.1.20:1234/v1")).resolves.toBe(true);
    expect(f.mock.calls[0][0]).toBe("http://192.168.1.20:1234/v1/models");
  });

  it("sonde le loopback et un nom .local", async () => {
    vi.stubGlobal("fetch", okModels([]));
    await expect(probeEndpoint("http://127.0.0.1:11434/v1")).resolves.toBe(true);
    await expect(probeEndpoint("http://lmstudio.local:1234/v1")).resolves.toBe(true);
  });

  it("REFUSE le link-local / métadonnées cloud, sans aucun fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(probeEndpoint("http://169.254.169.254/v1")).resolves.toBe(false);
    await expect(probeEndpoint("http://[fe80::1]/v1")).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuse un schéma non http(s) et une URL invalide", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(probeEndpoint("file:///tmp/v1")).resolves.toBe(false);
    await expect(probeEndpoint("not a url")).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("« joignable » = le serveur répond, même 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(probeEndpoint("http://localhost:1234/v1")).resolves.toBe(true);
  });

  it("injoignable sur erreur réseau", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(probeEndpoint("http://localhost:1234/v1")).resolves.toBe(false);
  });
});

describe("parseModelIds", () => {
  it("garde des ids uniques, bornés, dans l'ordre du serveur", () => {
    expect(parseModelIds({ data: [{ id: "b" }, { id: " a " }, { id: "b" }, { id: 3 }, { nope: 1 }] })).toEqual(["b", "a"]);
    expect(parseModelIds({ data: "x" })).toEqual([]);
    expect(parseModelIds(null)).toEqual([]);
    expect(parseModelIds({ data: Array.from({ length: 500 }, (_, i) => ({ id: `m${i}` })) })).toHaveLength(200);
  });
});

describe("listEndpointModels", () => {
  it("lit /models d'un serveur LAN", async () => {
    vi.stubGlobal("fetch", okModels(["llama3.2", "qwen/qwen3-8b"]));
    await expect(listEndpointModels("http://192.168.1.20:1234/v1/")).resolves.toEqual(["llama3.2", "qwen/qwen3-8b"]);
  });

  it("jette sur un hôte link-local, sans fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(listEndpointModels("http://169.254.169.254/v1")).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });

  it("jette sur un statut non-200 et sur un corps non JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(listEndpointModels("http://localhost:1/v1")).rejects.toThrow(/500/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(listEndpointModels("http://localhost:1/v1")).rejects.toThrow();
  });
});
