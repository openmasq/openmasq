import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp", getAppPath: () => "/tmp/app", isPackaged: true } }));
const { playwrightMcpSpawn } = await import("./browserTools");
const { parseCdpPreamble } = await import("./browser/cdpPreamble");

const ENDPOINT = `http://127.0.0.1:51234/${"cd".repeat(18)}`;

describe("playwrightMcpSpawn — the CDP broker secret is never in the child's exec environment", () => {
  it("puts the endpoint in the stdin preamble only", () => {
    const spec = playwrightMcpSpawn(ENDPOINT);
    expect(Object.values(spec.env ?? {}).some((v) => v.includes(ENDPOINT) || v.includes("cd".repeat(18)))).toBe(false);
    expect(Object.keys(spec.env ?? {}).some((k) => /CDP/i.test(k))).toBe(false);
    expect(parseCdpPreamble(JSON.stringify(spec.preamble))).toBe(ENDPOINT);
  });
});
