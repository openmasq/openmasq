// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mockModel } from "../mockModel";
import { SCENARIOS } from "./catalog";
import { WORKFLOW_SCENARIOS } from "./catalog.workflows";
import { WORKFLOW2_SCENARIOS } from "./catalog.workflows2";
import { TEMPLATE_SCENARIOS } from "./catalog.templates";
import { TEMPLATE2_SCENARIOS } from "./catalog.templates2";
import { REAL_SCENARIOS } from "./catalog.real";
import { REAL_DATA_SCENARIOS } from "./catalog.realData";
import { runScenario } from "./index";

const ALL = [
  ...SCENARIOS,
  ...WORKFLOW_SCENARIOS,
  ...WORKFLOW2_SCENARIOS,
  ...TEMPLATE_SCENARIOS,
  ...TEMPLATE2_SCENARIOS,
  ...REAL_SCENARIOS,
  ...REAL_DATA_SCENARIOS,
];

// FREE conformance: every catalog scenario, driven by its own scripted model. This is
// what keeps the catalog honest — a spec no scripted agent can satisfy would fail the
// real model for OUR reasons, and a harness regression would surface here, on every
// commit, before it costs a paid call.

describe("scenario catalog — scripted-model conformance", () => {
  for (const sc of ALL) {
    it(
      sc.name,
      async () => {
        const m = await mockModel(sc.mock);
        try {
          const { run, verdict } = await runScenario(
            { provider: "openai-compat", modelId: "qwen2.5", baseUrl: m.url },
            sc,
          );
          try {
            expect(verdict.failures, run.transcript.format()).toEqual([]);
            sc.extraFree?.(run);
          } finally {
            await run.dispose();
          }
        } finally {
          m.close();
        }
      },
      60_000,
    );
  }
});
