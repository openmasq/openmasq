import { describe, it, expect } from "vitest";
import { makeRedactFn } from "./redactionEngine";
import type { Host } from "../host";
import type { Settings } from "../types";

// The regex/patterns path is pure (no host subsystems touched), so a minimal stub
// host + a settings object exercising `redactEngine: "patterns"` is enough to lock
// in the extracted engine's behaviour without any network/model.
const host = {} as Host;

function settings(over: Partial<Settings> = {}): Settings {
  return {
    redactEngine: "patterns",
    redactCategories: {},
    ...over,
  } as unknown as Settings;
}

describe("makeRedactFn", () => {
  it("returns whitespace-only text unchanged with no matches", async () => {
    const redact = makeRedactFn(host, settings());
    const r = await redact("   ");
    expect(r).toEqual({ text: "   ", matches: [] });
  });

  it("rejects an already-aborted signal", async () => {
    const redact = makeRedactFn(host, settings());
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(redact("some@email.com", ctrl.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("redacts a clear email via the regex rules", async () => {
    const redact = makeRedactFn(host, settings());
    const r = await redact("écris à jean@example.com stp");
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.text).not.toContain("jean@example.com");
  });

  it("respects a DISABLED category (email off ⇒ email left in clear)", async () => {
    const redact = makeRedactFn(host, settings({ redactCategories: { email: false } as Settings["redactCategories"] }));
    const r = await redact("écris à jean@example.com stp");
    expect(r.text).toContain("jean@example.com");
  });

  // The "cette conversation" bug: a conversation override must beat the global default
  // on the document/attachment path, exactly like it does on the message path.
  it("a conversation override turning a category OFF beats the global default ON", async () => {
    const redact = makeRedactFn(host, settings({ redactCategories: { email: true } as Settings["redactCategories"] }));
    const r = await redact("écris à jean@example.com stp", undefined, undefined, { email: false });
    expect(r.text).toContain("jean@example.com");
  });

  it("a conversation override turning a category ON beats the global default OFF", async () => {
    const redact = makeRedactFn(host, settings({ redactCategories: { email: false } as Settings["redactCategories"] }));
    const r = await redact("écris à jean@example.com stp", undefined, undefined, { email: true });
    expect(r.text).not.toContain("jean@example.com");
  });

  it("with no conversation override, the global default alone still applies", async () => {
    const redact = makeRedactFn(host, settings({ redactCategories: { email: false } as Settings["redactCategories"] }));
    const r = await redact("écris à jean@example.com stp");
    expect(r.text).toContain("jean@example.com");
  });

  // Audit 2026-08-10: the Coffre follows this path just like it follows the send. Without `forced`,
  // the aperçu « Ce qui quittera la machine » showed a Coffre term IN CLEAR even
  // though the send masks it — and the drop pass (same path) left its
  // `replacements` without it.
  it("a COFFRE term is masked (forced), even under the regex engine", async () => {
    const redact = makeRedactFn(
      host,
      settings({ coffre: [{ value: "Projet-Basilic", token: "NAME", addedAt: 1 }] } as unknown as Partial<Settings>),
    );
    const r = await redact("le dossier Projet-Basilic avance bien");
    expect(r.text).not.toContain("Projet-Basilic");
    // Reversible: the pair is indeed in the provided vault.
    const vault: Record<string, string> = {};
    const r2 = await redact("le dossier Projet-Basilic avance bien", undefined, vault);
    expect(r2.text).not.toContain("Projet-Basilic");
    expect(Object.values(vault)).toContain("Projet-Basilic");
  });
});
