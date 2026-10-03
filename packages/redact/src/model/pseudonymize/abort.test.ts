import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";

const TEXT = "Contact Marie Dupont at marie.dupont@example.com.";
const NER = async () => [{ value: "Marie Dupont", category: "name" }];

describe("pseudonymize — `signal`", () => {
  it("an abort DURING the detector rejects the pass, it does not finish on the rules", async () => {
    const ctrl = new AbortController();
    const detectLocal = async () => {
      ctrl.abort();
      throw new DOMException("aborted", "AbortError");
    };
    await expect(pseudonymize(TEXT, { detectLocal, signal: ctrl.signal })).rejects.toThrow(/abort/i);
  });

  it("an abort while the detector RESOLVES still stops before the synchronous phases", async () => {
    const ctrl = new AbortController();
    const vault: Record<string, string> = {};
    const detectLocal = async () => {
      ctrl.abort();
      return NER();
    };
    await expect(pseudonymize(TEXT, { vault, detectLocal, signal: ctrl.signal })).rejects.toThrow(/abort/i);
    expect(vault).toEqual({}); // nothing allocated
  });

  it("an already-aborted signal never calls the detector", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let called = false;
    const detectLocal = async () => {
      called = true;
      return NER();
    };
    await expect(pseudonymize(TEXT, { detectLocal, signal: ctrl.signal })).rejects.toThrow(/abort/i);
    expect(called).toBe(false);
  });

  it("a live signal changes nothing; a failing detector WITHOUT abort is still reported", async () => {
    const plain = await pseudonymize(TEXT, { detectLocal: NER });
    const withSignal = await pseudonymize(TEXT, { detectLocal: NER, signal: new AbortController().signal });
    expect(withSignal).toEqual(plain);
    const failed = await pseudonymize(TEXT, {
      detectLocal: async () => {
        throw new Error("weights");
      },
      signal: new AbortController().signal,
    });
    expect(failed.modelError ?? "").toMatch(/weights/);
  });
});
