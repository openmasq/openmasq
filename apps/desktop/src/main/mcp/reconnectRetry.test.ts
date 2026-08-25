import { describe, it, expect, vi } from "vitest";
// ⚠️ Le helper vit dans `server/`, que le vitest `include` NE couvre PAS — le test
// doit donc rester dans `mcp/` et importer le sous-chemin (même piège que
// `customServer.test.ts`). Un test placé dans `server/` ne tournerait jamais.
import { isTransientConnectError, reconnectRemoteWithRetry } from "./server/reconnectRetry";
import type { McpServerInfo } from "./server/types";

const info = (over: Partial<McpServerInfo> = {}): McpServerInfo =>
  ({ id: "x", name: "x", url: "", kind: "http", connected: false, authorized: false, ...over }) as McpServerInfo;

describe("isTransientConnectError", () => {
  it("transitoire → retry (réseau/timeout/handshake, message inconnu)", () => {
    expect(isTransientConnectError("fetch failed")).toBe(true);
    expect(isTransientConnectError("request timed out")).toBe(true);
    expect(isTransientConnectError("socket hang up")).toBe(true);
  });
  it("PERMANENT → pas de retry (l'utilisateur/serveur doit changer quelque chose)", () => {
    expect(isTransientConnectError("authorization required")).toBe(false);
    expect(isTransientConnectError("authorization failed")).toBe(false);
    expect(isTransientConnectError("Ce serveur n'autorise pas l'inscription OAuth (dynamic client registration)")).toBe(false);
    expect(isTransientConnectError("clé API refusée")).toBe(false);
    expect(isTransientConnectError("URL refusée (hôte interne)")).toBe(false);
  });
  it("une autorisation MORTE, dans la langue des fournisseurs (journal du 15/08)", () => {
    // La liste ne portait que NOS formulations : chacune de celles-ci était retentée
    // 3 fois + backoff à chaque démarrage, sans la moindre chance d'aboutir.
    for (const m of [
      "Refresh token is invalid.", // Vercel — le cas rapporté
      "invalid_grant", // le code standard OAuth2
      "Token has been expired or revoked.", // Google
      "The refresh token is invalid or expired",
      "401 Unauthorized",
      "403 Forbidden",
      "invalid_client",
    ]) {
      expect(isTransientConnectError(m), m).toBe(false);
    }
  });
  it("le RÉSEAU reste retentable — la garde ne doit pas tout figer", () => {
    for (const m of ["fetch failed", "ETIMEDOUT", "socket hang up", "ECONNRESET", "502 Bad Gateway"])
      expect(isTransientConnectError(m), m).toBe(true);
  });
  it("pas d'erreur → non-retentable (rien à retenter)", () => {
    expect(isTransientConnectError(undefined)).toBe(false);
    expect(isTransientConnectError("")).toBe(false);
  });
});

describe("reconnectRemoteWithRetry", () => {
  it("réussit dès la 1re tentative → un seul appel", async () => {
    let live = false;
    const connectOnce = vi.fn(async () => {
      live = true;
      return info({ connected: true });
    });
    await reconnectRemoteWithRetry(connectOnce, () => live, { baseDelayMs: 1 });
    expect(connectOnce).toHaveBeenCalledTimes(1);
  });

  it("retente un échec TRANSITOIRE puis réussit (le timeout du démarrage sous charge)", async () => {
    let live = false;
    let n = 0;
    const connectOnce = vi.fn(async () => {
      n++;
      if (n < 3) return info({ error: "fetch failed" }); // 2 timeouts…
      live = true;
      return info({ connected: true }); // …puis ça passe
    });
    await reconnectRemoteWithRetry(connectOnce, () => live, { baseDelayMs: 1 });
    expect(connectOnce).toHaveBeenCalledTimes(3);
    expect(live).toBe(true);
  });

  it("N'INSISTE PAS sur un échec permanent (un seul appel, pas de boucle de boot)", async () => {
    const connectOnce = vi.fn(async () => info({ error: "authorization required" }));
    await reconnectRemoteWithRetry(connectOnce, () => false, { baseDelayMs: 1 });
    expect(connectOnce).toHaveBeenCalledTimes(1);
  });

  it("plafonne à `tries` sur un transitoire persistant, sans throw", async () => {
    const connectOnce = vi.fn(async () => info({ error: "socket hang up" }));
    await expect(
      reconnectRemoteWithRetry(connectOnce, () => false, { tries: 3, baseDelayMs: 1 }),
    ).resolves.toBeTruthy(); // ne throw pas — et rend le dernier verdict (ci-dessous)
    expect(connectOnce).toHaveBeenCalledTimes(3);
  });

  it("REND le dernier verdict — sans lui, une autorisation morte au démarrage n'était visible NULLE PART", async () => {
    // `infoFor` ne porte pas l'erreur, donc `mcp:list` non plus : c'est cette valeur de
    // retour qui permet à `mcpReconnectStored` d'inscrire le connecteur à la bannière.
    const mort = await reconnectRemoteWithRetry(
      async () => info({ error: "Refresh token is invalid." }),
      () => false,
      { baseDelayMs: 1 },
    );
    expect(mort?.error).toBe("Refresh token is invalid.");
    expect(isTransientConnectError(mort?.error)).toBe(false); // ⇒ la bannière s'allume

    // Un succès rend aussi son info, sans erreur — rien à signaler.
    const ok = await reconnectRemoteWithRetry(async () => info({ connected: true }), () => true, { baseDelayMs: 1 });
    expect(ok?.error).toBeUndefined();
  });

  it("un throw inattendu est traité comme transitoire (retenté jusqu'au plafond)", async () => {
    const connectOnce = vi.fn(async () => {
      throw new Error("boom");
    });
    await reconnectRemoteWithRetry(connectOnce, () => false, { tries: 2, baseDelayMs: 1 });
    expect(connectOnce).toHaveBeenCalledTimes(2);
  });
});
