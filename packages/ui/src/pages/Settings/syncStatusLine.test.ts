import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { syncStatusLine } from "./syncStatusLine";
import type { SyncStatusSnapshot } from "../../host";
import { brandHost } from "@openmasq/branding";

/**
 * The sync status indicator's sentence. Two possible lies, each costly: saying
 * « réussi » during an outage (the user believes their data is synced), or staying
 * red after recovery (they learn to ignore red — the lesson from banners).
 */
const NOW = 1_000_000_000;
const snap = (over: Partial<SyncStatusSnapshot>): SyncStatusSnapshot => ({
  env: "staging",
  backendHost: brandHost("staging"),
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  ...over,
});

const fr = getMessages("fr");

describe("syncStatusLine — le plus récent des deux événements dit le verdict", () => {
  it("échec APRÈS succès = panne EN COURS, quoi qu'ait réussi avant", () => {
    const { text, tone } = syncStatusLine(
      snap({ lastOkAt: NOW - 600_000, lastErrorAt: NOW - 60_000, lastError: "HTTP 403" }), fr, NOW,
    );
    expect(tone).toBe("err");
    // The reason IS SHOWN: « HTTP 403 » (device revoked) and « serveur injoignable »
    // aren't diagnosed the same way, and that's the whole point of the indicator.
    expect(text).toContain("HTTP 403");
  });

  it("succès APRÈS échec = panne finie — l'afficher encore apprendrait à ignorer le rouge", () => {
    const { text, tone } = syncStatusLine(
      snap({ lastErrorAt: NOW - 600_000, lastError: "serveur injoignable", lastOkAt: NOW - 30_000 }), fr, NOW,
    );
    expect(tone).toBe("ok");
    expect(text).not.toContain("injoignable");
  });

  it("aucun appel depuis le lancement : neutre, pas une panne", () => {
    const { tone, text } = syncStatusLine(snap({}), fr, NOW);
    expect(tone).toBe("muted");
    expect(text).toContain("Aucun échange");
  });

  it("un échec sans succès antérieur est bien un échec", () => {
    expect(syncStatusLine(snap({ lastErrorAt: NOW - 5_000, lastError: "HTTP 503" }), fr, NOW).tone).toBe("err");
  });

  it("une panne DÉFINITIVE ne promet pas de se réparer seule — elle dit quoi faire", () => {
    // Decryption impossible (the passphrase doesn't open the envelope): no retry will
    // change anything, and « Réessaiera tout seul » would make it wait for an outcome that never comes.
    const out = syncStatusLine(
      snap({ lastErrorAt: NOW - 5_000, lastError: "la phrase secrète…", lastErrorFatal: true }), fr, NOW,
    );
    expect(out.tone).toBe("err");
    expect(out.text).not.toMatch(/Réessaiera tout seul/);
    expect(out.text).toMatch(/phrase secrète de cet appareil/);
  });

  it("une panne ORDINAIRE garde sa promesse de réessai", () => {
    const out = syncStatusLine(snap({ lastErrorAt: NOW - 5_000, lastError: "HTTP 503" }), fr, NOW);
    expect(out.text).toMatch(/Réessaiera tout seul/);
  });
});
