import { describe, expect, it } from "vitest";
import { deepLinkTarget, protocolAction } from "./deepLink";

/** Any app on the machine can register the scheme and any web page can try to open one,
 *  so this allow-list is reached by URLs we did not author. Everything it does not
 *  recognise must come back `null` — REFUSE — never a default route. */
describe("deepLinkTarget", () => {
  it("routes the three callbacks we dispatch", () => {
    expect(deepLinkTarget("acme://auth/callback?code=x", "acme")).toBe("auth");
    expect(deepLinkTarget("acme://billing/callback", "acme")).toBe("billing");
    expect(deepLinkTarget("acme://openrouter/callback?code=x", "acme")).toBe("openrouter");
    expect(deepLinkTarget("acme://auth/callback/", "acme")).toBe("auth"); // trailing slash
  });

  it("refuses another scheme — including one that merely looks like ours", () => {
    expect(deepLinkTarget("https://auth/callback", "acme")).toBeNull();
    expect(deepLinkTarget("acme-evil://auth/callback", "acme")).toBeNull();
    expect(deepLinkTarget("acme://auth/callback", "otherscheme")).toBeNull();
  });

  it("refuses an unknown host or path — no partial match, no prefix", () => {
    expect(deepLinkTarget("acme://evil/callback", "acme")).toBeNull();
    expect(deepLinkTarget("acme://authx/callback", "acme")).toBeNull();
    expect(deepLinkTarget("acme://auth/callbackx", "acme")).toBeNull();
    expect(deepLinkTarget("acme://auth/", "acme")).toBeNull();
  });

  it("an UNPARSEABLE url refuses — it must not fall back to a route", () => {
    expect(deepLinkTarget("pas une url", "acme")).toBeNull();
    expect(deepLinkTarget("", "acme")).toBeNull();
  });
});

describe("protocolAction — qui a le droit de répondre au deep-link", () => {
  const mac = { platform: "darwin" as NodeJS.Platform };
  const win = { platform: "win32" as NodeJS.Platform };

  it("l'app PACKAGÉE s'enregistre, sur toute plateforme", () => {
    expect(protocolAction({ packaged: true, ...mac, devEntry: null })).toBe("register");
    expect(protocolAction({ packaged: true, ...win, devEntry: null })).toBe("register");
  });

  // Le bug : sur macOS `path`/`args` sont ignorés, donc un dev enregistrait
  // `node_modules/electron/dist/Electron.app` — un Electron NU. Le lien d'un e-mail
  // ouvrait alors « To run a local app… », et l'app installée avait perdu le schéma.
  it("un dev macOS ne s'enregistre JAMAIS — il se désenregistre", () => {
    expect(protocolAction({ packaged: false, ...mac, devEntry: "/abs/app" })).toBe("unregister");
    expect(protocolAction({ packaged: false, ...mac, devEntry: null })).toBe("unregister");
  });

  it("Windows garde l'enregistrement dev, où execPath + entrée sont honorés", () => {
    expect(protocolAction({ packaged: false, ...win, devEntry: "C:\\app" })).toBe("register");
    // Sans entrée résolue, il n'y a rien de sensé à déclarer : on s'abstient.
    expect(protocolAction({ packaged: false, ...win, devEntry: null })).toBe("skip");
  });
});
