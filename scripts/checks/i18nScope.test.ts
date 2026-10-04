import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs gate module, no declaration file.
import { AGENT_NOT_UI, inI18nScope } from "./i18nScope.mjs";

const root = join(__dirname, "../..");

describe("the i18n ratchet's scope over agent/", () => {
  it("covers the agent/ files the USER reads", () => {
    for (const f of ["humanToolLabel.ts", "toolActionLabel.ts", "mcpAgentOutcome.ts"]) {
      expect(inI18nScope(`packages/ui/src/agent/${f}`), f).toBe(true);
    }
  });

  it("covers a NEW agent/ file by default — model prose is the listed exception", () => {
    expect(inI18nScope("packages/ui/src/agent/someNewThing.ts")).toBe(true);
  });

  it("skips the listed model-prose files, tests and prompt/", () => {
    expect(inI18nScope("packages/ui/src/agent/mcpAgentGuidance.ts")).toBe(false);
    expect(inI18nScope("packages/ui/src/agent/humanToolLabel.test.ts")).toBe(false);
    expect(inI18nScope("packages/ui/src/prompt/system.ts")).toBe(false);
  });

  it("lists only files that exist (a stale entry is a silent hole)", () => {
    for (const f of AGENT_NOT_UI as string[]) expect(existsSync(join(root, f)), f).toBe(true);
  });
});
