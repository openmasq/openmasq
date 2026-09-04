// What this pins: the generated `app-update.yml` (the afterPack repair for a split mac
// build) can carry `publisherName`, and REFUSES to describe a win32 feed without it — on
// Windows that line is the only integrity anchor of an update besides TLS (audit 04/09:
// the generator had no slot for it, so the day Authenticode signing lands, the repair path
// would have produced an unverifiable config while everything else went green).
import { describe, it, expect } from "vitest";
import { appUpdateYmlContent } from "./appUpdateYml.cjs";

const publish = {
  provider: "generic",
  url: "https://updates.example/desktop",
  channel: "desktop-stable",
};

describe("appUpdateYmlContent", () => {
  it("mac: no publisherName line — Developer ID + notarization are the anchor there", () => {
    const yml = appUpdateYmlContent(publish, "OpenMasq", { platform: "darwin" });
    expect(yml).toBe(
      "provider: generic\nurl: https://updates.example/desktop\nchannel: desktop-stable\nupdaterCacheDirName: openmasq-updater\n",
    );
  });

  it("win32 WITH publisherName: the line is emitted", () => {
    const yml = appUpdateYmlContent(publish, "OpenMasq", {
      platform: "win32",
      publisherName: "OpenMasq SAS",
    });
    expect(yml).toContain("publisherName: OpenMasq SAS\n");
  });

  it("win32 WITHOUT publisherName: refuses rather than writing an unverifiable feed", () => {
    expect(() => appUpdateYmlContent(publish, "OpenMasq", { platform: "win32" })).toThrow(
      /publisherName/,
    );
    expect(() =>
      appUpdateYmlContent(publish, "OpenMasq", { platform: "win32", publisherName: "" }),
    ).toThrow(/publisherName/);
  });

  it("no opts at all keeps the historical mac shape (the existing caller)", () => {
    expect(appUpdateYmlContent(publish, "OpenMasq")).not.toContain("publisherName");
  });

  it("still refuses a feed it cannot describe", () => {
    expect(() => appUpdateYmlContent({ provider: "github" }, "OpenMasq")).toThrow(
      /provider generic/,
    );
  });
});
