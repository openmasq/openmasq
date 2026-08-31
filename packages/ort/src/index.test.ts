import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

// The shim loads as CJS (that's what `@huggingface/transformers` does with it), and it
// resolves REAL engines at import time. So we don't test the native/WASM choice — it depends
// on the machine — but the wrapper, which is the part where an error is paid for silently.
const { envelopperWasm, nombreDeFils } = createRequire(import.meta.url)("./index.cjs") as {
  envelopperWasm: (impl: unknown, lire?: (p: string) => Uint8Array) => { create: (...a: unknown[]) => unknown };
  nombreDeFils: (coeurs: number, sharedArrayBuffer: boolean) => number;
};

const faux = () => {
  const create = vi.fn(async () => ({ ok: true }));
  return { impl: { InferenceSession: { create } }, create };
};

describe("repli WASM d'onnxruntime", () => {
  it("lit le fichier au lieu de passer un CHEMIN au WASM", async () => {
    // A string would be understood as a URL TO FETCH: the sha256-verified weight on
    // disk would be ignored in favor of a download. This is the line that prevents it.
    const { impl, create } = faux();
    const lire = vi.fn(() => new Uint8Array([1, 2, 3]));
    await envelopperWasm(impl, lire).create("/chemin/model_quantized.onnx", {});
    expect(lire).toHaveBeenCalledWith("/chemin/model_quantized.onnx");
    expect(create.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
  });

  it("laisse passer des octets déjà lus", async () => {
    const { impl, create } = faux();
    const octets = new Uint8Array([9, 9]);
    const lire = vi.fn();
    await envelopperWasm(impl, lire).create(octets, {});
    expect(lire).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0]).toBe(octets);
  });

  it("traduit le fournisseur `cpu` du natif en `wasm`", async () => {
    const { impl, create } = faux();
    await envelopperWasm(impl, () => new Uint8Array()).create(new Uint8Array(), {
      executionProviders: ["cpu"],
    });
    expect((create.mock.calls[0][1] as { executionProviders: string[] }).executionProviders).toEqual(["wasm"]);
  });

  it("impose `wasm` quand l'appelant ne demande rien", async () => {
    const { impl, create } = faux();
    await envelopperWasm(impl, () => new Uint8Array()).create(new Uint8Array(), {});
    expect((create.mock.calls[0][1] as { executionProviders: string[] }).executionProviders).toEqual(["wasm"]);
  });

  it("conserve les autres options telles quelles", async () => {
    const { impl, create } = faux();
    await envelopperWasm(impl, () => new Uint8Array()).create(new Uint8Array(), {
      graphOptimizationLevel: "all",
      executionProviders: ["cpu"],
    });
    expect(create.mock.calls[0][1]).toMatchObject({ graphOptimizationLevel: "all" });
  });
});

describe("nombre de fils du WASM", () => {
  it("cœurs − 1, plafonné à 4 — le fil principal reste réactif", () => {
    expect(nombreDeFils(4, true)).toBe(3); // the Intel mac mini from the original measurement
    expect(nombreDeFils(8, true)).toBe(4);
    expect(nombreDeFils(16, true)).toBe(4);
  });

  it("jamais moins d'un fil, même mono-cœur", () => {
    expect(nombreDeFils(1, true)).toBe(1);
    expect(nombreDeFils(0, true)).toBe(1);
  });

  it("sans SharedArrayBuffer, un seul fil (les threads WASM n'existent pas)", () => {
    expect(nombreDeFils(8, false)).toBe(1);
  });
});
