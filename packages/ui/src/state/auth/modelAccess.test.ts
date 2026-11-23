import { describe, expect, it } from "vitest";
import { modelAccess } from "./modelAccess";

const base = { served: false, agents: [], keyConfigured: new Set<string>() };

describe("modelAccess", () => {
  it("is none with nothing set up on an unserved build", () => {
    expect(modelAccess(base)).toBe("none");
  });

  it("counts an agent only when switched on AND found", () => {
    expect(modelAccess({ ...base, agents: [{ enabled: true, detected: false }] })).toBe("none");
    expect(modelAccess({ ...base, agents: [{ enabled: true, detected: null }] })).toBe("none");
    expect(modelAccess({ ...base, agents: [{ enabled: false, detected: true }] })).toBe("none");
    expect(modelAccess({ ...base, agents: [{ enabled: true, detected: true }] })).toBe("agent");
  });

  it("does NOT count an agent its own status says is signed out — it would answer nothing", () => {
    expect(modelAccess({ ...base, agents: [{ enabled: true, detected: true, signedOut: true }] })).toBe("none");
    expect(modelAccess({ ...base, agents: [{ enabled: true, detected: true, signedOut: false }] })).toBe("agent");
    // a signed-out agent beside a key: the key is the road
    expect(
      modelAccess({ ...base, agents: [{ enabled: true, detected: true, signedOut: true }], keyConfigured: new Set(["openai"]) }),
    ).toBe("key");
  });

  it("counts a provider key, never a key that answers nothing", () => {
    expect(modelAccess({ ...base, keyConfigured: new Set(["redactModel"]) })).toBe("none");
    expect(modelAccess({ ...base, keyConfigured: new Set(["openrouter"]) })).toBe("key");
  });

  it("counts a local endpoint, then the served platform", () => {
    expect(modelAccess({ ...base, localReachable: null })).toBe("none");
    expect(modelAccess({ ...base, localReachable: false })).toBe("none");
    expect(modelAccess({ ...base, localReachable: true })).toBe("local");
    expect(modelAccess({ ...base, served: true })).toBe("platform");
  });

  it("names the road the person will use: agent over key over platform", () => {
    const all = {
      served: true,
      agents: [{ enabled: true, detected: true }],
      keyConfigured: new Set(["openai"]),
    };
    expect(modelAccess(all)).toBe("agent");
    expect(modelAccess({ ...all, agents: [] })).toBe("key");
  });
});
