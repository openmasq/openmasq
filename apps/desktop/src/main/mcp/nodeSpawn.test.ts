// The `npx` fallback exists for ONE case: a dev checkout without the optional dependency
// installed. In a PACKAGED build the same failure means the server was mis-bundled — and
// returning `{command:"npx"}` there converts a packaging defect into a network action:
// `npx -y <pkg>` fetches and executes whatever the registry currently serves under that
// name, unpinned, as the signed app. That is the exact opposite of the module's premise
// ("no npx, no network"), so a packaged build must fail loudly instead.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { packaged: false };
vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return state.packaged;
    },
  },
}));

import { nodeSpawnFor } from "./nodeSpawn";

// A package name nothing will ever resolve — the mis-bundle / missing-dep case.
const MISSING = "@openmasq/definitely-not-a-real-package";

beforeEach(() => {
  state.packaged = false;
});

describe("nodeSpawnFor", () => {
  it("passes a non-npx command through untouched, packaged or not", () => {
    for (const packaged of [false, true]) {
      state.packaged = packaged;
      expect(nodeSpawnFor("python3", ["-m", "server"])).toEqual({
        command: "python3",
        args: ["-m", "server"],
      });
    }
  });

  it("falls back to npx in DEV when the package isn't installed", () => {
    expect(nodeSpawnFor("npx", ["-y", MISSING, "--port", "0"])).toEqual({
      command: "npx",
      args: ["-y", MISSING, "--port", "0"],
    });
  });

  it("THROWS in a packaged build instead of reaching the npm registry", () => {
    state.packaged = true;
    expect(() => nodeSpawnFor("npx", ["-y", MISSING])).toThrow();
  });

  it("an npx invocation with no package at all is still passed through", () => {
    state.packaged = true;
    expect(nodeSpawnFor("npx", ["-y"])).toEqual({ command: "npx", args: ["-y"] });
  });
});
