import { describe, expect, it, vi } from "vitest";

// shipit.ts imports electron + ./log at module load (used only by the runtime detector,
// not by the pure `parseShipItFailure` under test) — stub them so the module loads.
vi.mock("electron", () => ({ app: { isPackaged: false, getPath: () => "/tmp" } }));
vi.mock("./log", () => ({ logUpdate: () => {}, logUpdateError: () => {} }));

import { parseShipItFailure } from "./shipit";

// Fixtures mirror the real ~/Library/Caches/<bundleId>.ShipIt/ShipIt_stderr.log
// format (`YYYY-MM-DD HH:MM:SS.mmm ShipIt[pid:tid] <message>`).

const SUCCESS = `2026-07-12 09:23:25.047 ShipIt[3049:22405] Detected this as an install request
2026-07-12 09:24:07.584 ShipIt[3049:23546] Installation completed successfully
2026-07-12 09:24:13.317 ShipIt[3049:23630] ShipIt quitting`;

const APP_STILL_RUNNING = `2026-07-13 19:12:22.420 ShipIt[8608:2775880] Beginning installation
2026-07-13 19:13:01.917 ShipIt[8608:2782696] Aborting update attempt because there are 3 running instances of the target app
2026-07-13 19:13:01.919 ShipIt[8608:2783505] Installation cancelled: Error Domain=SQRLInstallerErrorDomain Code=-9 "App Still Running Error"
2026-07-13 19:13:01.919 ShipIt[8608:2783505] ShipIt quitting`;

describe("parseShipItFailure", () => {
  it("returns null when the last outcome was a success", () => {
    expect(parseShipItFailure(SUCCESS)).toBeNull();
  });

  it("returns null on an empty / outcome-less log", () => {
    expect(parseShipItFailure("")).toBeNull();
    expect(parseShipItFailure("2026-07-14 09:38:45.879 ShipIt[1:2] Detected this as an install request")).toBeNull();
  });

  it("detects the App-Still-Running abort with code + instance count", () => {
    expect(parseShipItFailure(APP_STILL_RUNNING)).toEqual({
      code: "-9",
      instances: 3,
      at: "2026-07-13 19:13:01.919",
    });
  });

  it("does NOT report a failure that a later attempt superseded with success", () => {
    // A failed attempt followed by a successful one → nothing to report.
    expect(parseShipItFailure(`${APP_STILL_RUNNING}\n${SUCCESS}`)).toBeNull();
  });

  it("reports the newest failure when a success is followed by a later failure", () => {
    const out = parseShipItFailure(`${SUCCESS}\n${APP_STILL_RUNNING}`);
    expect(out?.code).toBe("-9");
    expect(out?.instances).toBe(3);
  });
});
