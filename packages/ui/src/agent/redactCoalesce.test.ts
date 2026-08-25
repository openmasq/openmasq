import { describe, it, expect, vi } from "vitest";
import { makeCoalescingRedactor } from "./redactCoalesce";
import type { Vault } from "@openmasq/mcp";

const vault: Vault = {};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("makeCoalescingRedactor", () => {
  it("coalesce une vague même-outil en UN appel `many`, résultats bien attribués", async () => {
    const many = vi.fn(async (texts: string[]) => texts.map((t) => `R:${t}`));
    const one = vi.fn(async (t: string) => `S:${t}`);
    const redact = makeCoalescingRedactor({ one, many });
    const [a, b, c] = await Promise.all([
      redact("a", vault, "gmail__get"),
      redact("b", vault, "gmail__get"),
      redact("c", vault, "gmail__get"),
    ]);
    expect([a, b, c]).toEqual(["R:a", "R:b", "R:c"]);
    expect(many).toHaveBeenCalledTimes(1);
    expect(one).not.toHaveBeenCalled();
  });

  it("ne mélange JAMAIS deux outils dans un même lot (la politique par connecteur)", async () => {
    const calls: string[][] = [];
    const many = vi.fn(async (texts: string[]) => {
      calls.push([...texts]);
      return texts.map((t) => t.toUpperCase());
    });
    const one = vi.fn(async (t: string) => t.toUpperCase());
    const redact = makeCoalescingRedactor({ one, many });
    await Promise.all([
      redact("a", vault, "gmail__get"),
      redact("b", vault, "browser_navigate"),
      redact("c", vault, "gmail__get"),
    ]);
    for (const batch of calls) {
      expect(batch).not.toEqual(expect.arrayContaining(["b"]));
    }
    // gmail (a,c) part en lot ; browser (b) passe seul par `one`.
    expect(calls).toEqual([["a", "c"]]);
    expect(one).toHaveBeenCalledTimes(1);
  });

  it("sans `many`, sérialise strictement — jamais deux passes moteur en même temps", async () => {
    let active = 0;
    let maxActive = 0;
    const one = vi.fn(async (t: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await tick();
      active--;
      return `S:${t}`;
    });
    const redact = makeCoalescingRedactor({ one });
    const out = await Promise.all([redact("a", vault, "x"), redact("b", vault, "x"), redact("c", vault, "y")]);
    expect(out).toEqual(["S:a", "S:b", "S:c"]);
    expect(maxActive).toBe(1); // l'identité atomique du vault repose dessus
  });

  it("un lot qui ÉCHOUE retombe entrée par entrée sur `one` — rien n'est perdu", async () => {
    const many = vi.fn(async () => {
      throw new Error("moteur KO sur le lot");
    });
    const one = vi.fn(async (t: string) => `S:${t}`);
    const redact = makeCoalescingRedactor({ one, many });
    const out = await Promise.all([redact("a", vault, "x"), redact("b", vault, "x")]);
    expect(out).toEqual(["S:a", "S:b"]);
    expect(one).toHaveBeenCalledTimes(2);
  });

  it("un `many` au compte FAUX ne mésattribue jamais — retombée par entrée", async () => {
    const many = vi.fn(async (texts: string[]) => texts.slice(1).map((t) => `R:${t}`));
    const one = vi.fn(async (t: string) => `S:${t}`);
    const redact = makeCoalescingRedactor({ one, many });
    const out = await Promise.all([redact("a", vault, "x"), redact("b", vault, "x")]);
    expect(out).toEqual(["S:a", "S:b"]);
  });

  it("l'échec d'UNE entrée ne rejette qu'elle, et la file continue", async () => {
    const one = vi.fn(async (t: string) => {
      if (t === "boom") throw new Error("échec ciblé");
      return `S:${t}`;
    });
    const redact = makeCoalescingRedactor({ one });
    const results = await Promise.allSettled([
      redact("a", vault, "x"),
      redact("boom", vault, "y"),
      redact("c", vault, "z"),
    ]);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: "S:a" });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toMatchObject({ status: "fulfilled", value: "S:c" });
  });

  it("une arrivée PENDANT une passe occupée rejoint le prochain lot de son outil", async () => {
    const seen: string[][] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const many = vi.fn(async (texts: string[]) => {
      seen.push([...texts]);
      if (seen.length === 1) await gate; // la 1re passe reste occupée
      return texts.map((t) => `R:${t}`);
    });
    const one = vi.fn(async (t: string) => {
      seen.push([t]);
      if (seen.length === 1) await gate;
      return `R:${t}`;
    });
    const redact = makeCoalescingRedactor({ one, many });
    const first = redact("a", vault, "x");
    await tick(); // la passe de « a » démarre (via `one`, groupe de 1)
    const late = [redact("b", vault, "x"), redact("c", vault, "x")];
    await tick();
    release();
    const out = await Promise.all([first, ...late]);
    expect(out).toEqual(["R:a", "R:b", "R:c"]);
    // b et c, arrivés pendant la passe de a, partent ensemble en UN lot.
    expect(seen).toEqual([["a"], ["b", "c"]]);
  });
});
