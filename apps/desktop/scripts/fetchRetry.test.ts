import { describe, it, expect, vi, afterEach } from "vitest";
import { backoffMs, fetchBytes, fetchWithRetry } from "./fetchRetry";

// Never really waits: the delays are the point of the design, not of the test.
const nap = { sleep: async () => {} };

function reply(status: number, body = "x", headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : body, { status, headers });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchWithRetry", () => {
  it("réessaie un 429 puis réussit — la panne du préflight Windows du 13/09", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200, "ok"));
    vi.stubGlobal("fetch", fetchMock);
    const bytes = await fetchBytes("https://exemple.test/poids.onnx", nap);
    expect(new TextDecoder().decode(bytes)).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("abandonne après le nombre d'essais, en nommant le dernier statut", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(503)));
    await expect(fetchBytes("https://exemple.test/a", { ...nap, attempts: 3 })).rejects.toThrow(
      /HTTP 503 for https:\/\/exemple\.test\/a \(after 3 attempt\(s\)\)/,
    );
  });

  it("ne réessaie JAMAIS un 404 : l'adresse est fausse, attendre n'y change rien", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(404));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBytes("https://exemple.test/absent", nap)).rejects.toThrow(/HTTP 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("réessaie une panne de transport (DNS, connexion coupée)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"))
      .mockResolvedValueOnce(reply(200, "ok"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBytes("https://exemple.test/a", nap)).resolves.toBeInstanceOf(Uint8Array);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rend la Response pour le téléchargement en flux", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(429)).mockResolvedValueOnce(reply(200, "py")));
    const res = await fetchWithRetry("https://exemple.test/python.tar", undefined, nap);
    expect(res.ok).toBe(true);
    expect(res.body).not.toBeNull();
  });
});

describe("backoffMs", () => {
  it("respecte le Retry-After de l'hôte quand il en donne un", () => {
    expect(backoffMs(1, "30")).toBe(30_000);
  });

  it("plafonne un Retry-After absurde à une minute", () => {
    expect(backoffMs(1, "86400")).toBe(60_000);
  });

  it("double à chaque essai sans en-tête", () => {
    expect([1, 2, 3, 4].map((a) => backoffMs(a))).toEqual([2000, 4000, 8000, 16_000]);
  });

  it("ignore un Retry-After en date HTTP plutôt que de dormir NaN", () => {
    expect(backoffMs(1, "Wed, 21 Oct 2026 07:28:00 GMT")).toBe(2000);
  });
});
