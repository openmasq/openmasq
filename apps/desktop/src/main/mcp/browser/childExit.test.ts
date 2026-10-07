// A clean quit of the agent-browser child (exit 0) is not a crash: it must not reach error
// tracking, while a signal or a non-zero code still must.
import { describe, it, expect, vi, beforeEach } from "vitest";

const reportMainError = vi.fn();
let quitting = false;
vi.mock("../../runtime/errorReport", () => ({ reportMainError: (...a: unknown[]) => reportMainError(...a) }));
vi.mock("../../runtime/quitState", () => ({ isAppQuitting: () => quitting }));

const { reportAgentExit } = await import("./childExit");

describe("reportAgentExit", () => {
  beforeEach(() => {
    reportMainError.mockClear();
    quitting = false;
  });

  it("does not report a clean exit (code 0)", () => {
    reportAgentExit("pipe", 0);
    reportAgentExit("port", 0);
    expect(reportMainError).not.toHaveBeenCalled();
  });

  it("reports a non-zero exit with its code", () => {
    reportAgentExit("pipe", 1);
    expect(reportMainError).toHaveBeenCalledWith("browser", "agent-exit-1", expect.any(Error));
  });

  it("reports a signal death (code null)", () => {
    reportAgentExit("port", null);
    expect(reportMainError).toHaveBeenCalledWith("browser", "agent-exit-?", expect.any(Error));
  });

  it("reports nothing while the app is quitting", () => {
    quitting = true;
    reportAgentExit("pipe", 1);
    expect(reportMainError).not.toHaveBeenCalled();
  });
});
