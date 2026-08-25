import { describe, expect, it } from "vitest";
import { syncStatusLine } from "./syncStatusLine";
import type { SyncStatusSnapshot } from "../../host";
import { brandHost } from "@openmasq/branding";

/**
 * La phrase du témoin de synchro. Deux mensonges possibles, chacun coûteux : dire
 * « réussi » pendant une panne (l'utilisateur croit ses données synchronisées), ou rester
 * rouge après la guérison (il apprend à ignorer le rouge — la leçon des encarts).
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

describe("syncStatusLine — le plus récent des deux événements dit le verdict", () => {
  it("échec APRÈS succès = panne EN COURS, quoi qu'ait réussi avant", () => {
    const { text, tone } = syncStatusLine(
      snap({ lastOkAt: NOW - 600_000, lastErrorAt: NOW - 60_000, lastError: "HTTP 403" }),
      NOW,
    );
    expect(tone).toBe("err");
    // La raison est MONTRÉE : « HTTP 403 » (appareil révoqué) et « serveur injoignable »
    // ne se diagnostiquent pas pareil, et c'est tout l'objet du témoin.
    expect(text).toContain("HTTP 403");
  });

  it("succès APRÈS échec = panne finie — l'afficher encore apprendrait à ignorer le rouge", () => {
    const { text, tone } = syncStatusLine(
      snap({ lastErrorAt: NOW - 600_000, lastError: "serveur injoignable", lastOkAt: NOW - 30_000 }),
      NOW,
    );
    expect(tone).toBe("ok");
    expect(text).not.toContain("injoignable");
  });

  it("aucun appel depuis le lancement : neutre, pas une panne", () => {
    const { tone, text } = syncStatusLine(snap({}), NOW);
    expect(tone).toBe("muted");
    expect(text).toContain("Aucun échange");
  });

  it("un échec sans succès antérieur est bien un échec", () => {
    expect(syncStatusLine(snap({ lastErrorAt: NOW - 5_000, lastError: "HTTP 503" }), NOW).tone).toBe("err");
  });

  it("une panne DÉFINITIVE ne promet pas de se réparer seule — elle dit quoi faire", () => {
    // Le déchiffrement impossible (la phrase n'ouvre pas l'enveloppe) : aucun réessai n'y
    // changera rien, et « Réessaiera tout seul » ferait attendre une issue qui ne vient pas.
    const out = syncStatusLine(
      snap({ lastErrorAt: NOW - 5_000, lastError: "la phrase secrète…", lastErrorFatal: true }),
      NOW,
    );
    expect(out.tone).toBe("err");
    expect(out.text).not.toMatch(/Réessaiera tout seul/);
    expect(out.text).toMatch(/phrase secrète de cet appareil/);
  });

  it("une panne ORDINAIRE garde sa promesse de réessai", () => {
    const out = syncStatusLine(snap({ lastErrorAt: NOW - 5_000, lastError: "HTTP 503" }), NOW);
    expect(out.text).toMatch(/Réessaiera tout seul/);
  });
});
