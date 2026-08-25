import { describe, expect, it, vi } from "vitest";
import { remoteRedact, remoteContractDowngrade } from "./remote";

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe("remoteRedact (client for apps/gateway)", () => {
  it("POSTs the payload with the Bearer token and returns the parsed result", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({ redacted: "hi FAKE", matches: [{ value: "x" }], vault: { FAKE: "x" } }),
    ) as unknown as typeof fetch;

    const out = await remoteRedact(
      { text: "hi x", vault: { A: "b" }, disabledKinds: ["email"], numbers: true },
      { url: "https://fn.example/redact", token: "jwt-123", fetchImpl },
    );

    expect(out.redacted).toBe("hi FAKE");
    expect(out.vault).toEqual({ FAKE: "x" });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://fn.example/redact");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer jwt-123",
      "Content-Type": "application/json",
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      text: "hi x",
      vault: { A: "b" },
      disabledKinds: ["email"],
      numbers: true,
      patternsOnly: false,
    });
  });

  it("throws on a non-2xx response (so the caller falls back to local redaction)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "bad token",
    })) as unknown as typeof fetch;

    await expect(
      remoteRedact({ text: "x" }, { url: "https://fn.example", token: "t", fetchImpl }),
    ).rejects.toThrow(/401/);
  });

  it("propagates a network error (caller falls back)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      remoteRedact({ text: "x" }, { url: "https://fn.example", token: "t", fetchImpl }),
    ).rejects.toThrow(/network down/);
  });
});

describe("remoteContractDowngrade — le handshake de contrat client↔serveur", () => {
  it("Strict (peopleNotoriety:false) ignoré par le serveur → une raison (fail-closed)", () => {
    // Un serveur d'AVANT le handshake ne renvoie pas `honored` : même signal.
    expect(remoteContractDowngrade({ peopleNotoriety: false }, undefined)).toMatch(/Strict/);
    // Un serveur à jour qui n'honore PAS ce champ (liste sans lui) : pareil.
    expect(remoteContractDowngrade({ peopleNotoriety: false }, ["keep", "forced"])).toMatch(/Strict/);
  });

  it("contrat tenu, ou option non demandée → null (aucun blocage)", () => {
    expect(remoteContractDowngrade({ peopleNotoriety: false }, ["peopleNotoriety"])).toBeNull();
    // Hors Strict, l'ignorance de ce champ n'est pas une fuite : rien à bloquer.
    expect(remoteContractDowngrade({ peopleNotoriety: true }, undefined)).toBeNull();
    expect(remoteContractDowngrade({}, undefined)).toBeNull();
  });
});
