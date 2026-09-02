// Pins the local group's REPLACEMENT rule: typed ids first, the server's next, no
// duplicate, never an empty replacement — and the baseline left alone when nothing came.
import { MODELS } from "@openmasq/llm";
import { describe, expect, it } from "vitest";
import type { Host } from "../host";
import { localModelList, parseLocalModelIds, refreshLocalModels } from "./useLocalModels";

const localIds = () => MODELS.filter((m) => m.provider === "openai-compat").map((m) => m.id);

describe("parseLocalModelIds", () => {
  it("coupe sur virgules, espaces, retours ; dédoublonne ; borne", () => {
    expect(parseLocalModelIds(" llama3.2, qwen/qwen3-8b\ngpt-oss;llama3.2 ")).toEqual(["llama3.2", "qwen/qwen3-8b", "gpt-oss"]);
    expect(parseLocalModelIds("")).toEqual([]);
    expect(parseLocalModelIds(Array.from({ length: 80 }, (_, i) => `m${i}`).join(","))).toHaveLength(50);
  });
});

describe("localModelList", () => {
  it("les ids saisis d'abord, puis ceux du serveur, sans doublon, gratuits, marqués (local)", () => {
    const out = localModelList(["mine"], ["served", "mine"]);
    expect(out.map((m) => m.id)).toEqual(["mine", "served"]);
    expect(out[0]).toMatchObject({ label: "mine (local)", provider: "openai-compat", pricing: { in: 0, out: 0 } });
  });
});

describe("refreshLocalModels", () => {
  it("ne touche pas au socle quand le host ne sait pas lister et que rien n'est saisi", async () => {
    const before = localIds();
    expect(before.length).toBeGreaterThan(0);
    await expect(refreshLocalModels({} as Host, "http://localhost:11434/v1", "")).resolves.toBe(0);
    expect(localIds()).toEqual(before);
  });

  it("ne touche pas au socle quand le serveur répond vide ou jette", async () => {
    const before = localIds();
    const empty = { models: { listOpenRouter: async () => [], listLocal: async () => [] } } as unknown as Host;
    await expect(refreshLocalModels(empty, "http://x/v1", "")).resolves.toBe(0);
    const throwing = { models: { listOpenRouter: async () => [], listLocal: async () => { throw new Error("down"); } } } as unknown as Host;
    await expect(refreshLocalModels(throwing, "http://x/v1", "")).resolves.toBe(0);
    expect(localIds()).toEqual(before);
  });

  it("REMPLACE le socle par la liste du serveur + les ids saisis", async () => {
    const host = { models: { listOpenRouter: async () => [], listLocal: async () => ["llama3.2", "typed"] } } as unknown as Host;
    await expect(refreshLocalModels(host, "http://x/v1", "typed, other")).resolves.toBe(3);
    expect(localIds()).toEqual(["typed", "other", "llama3.2"]);
    // Only this provider's group moved.
    expect(MODELS.some((m) => m.provider === "openrouter")).toBe(true);
  });
});
