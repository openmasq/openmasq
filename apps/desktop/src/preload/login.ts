/**
 * Preload for the sign-in window. Runs in the page's main world
 * (contextIsolation is disabled for this window) so it can fix the Chromium
 * client-hints JS API before the sign-in page's scripts run.
 *
 * - On Google: claim Firefox (UA + stripped Sec-CH-UA headers), and Firefox has
 *   no `navigator.userAgentData`, so we remove it entirely.
 * - Everywhere else (ChatGPT / Claude behind Cloudflare): keep the Chrome UA but
 *   REPLACE `navigator.userAgentData` so its brands agree with that UA. Electron's
 *   own value leaks an "Electron" brand, so JS-level client hints disagree with
 *   the UA — exactly what makes Cloudflare loop its challenge forever.
 */
try {
  const host = location.hostname;
  const isGoogle =
    /(^|\.)google\.com$/.test(host) || /(^|\.)google\.[a-z.]+$/.test(host);

  if (isGoogle) {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      get: () => undefined,
    });
  } else {
    const ua = navigator.userAgent;
    const major = (/Chrome\/(\d+)/.exec(ua) || [, "126"])[1] as string;
    const full = (/Chrome\/([\d.]+)/.exec(ua) || [, `${major}.0.0.0`])[1] as string;
    const brands = [
      { brand: "Chromium", version: major },
      { brand: "Google Chrome", version: major },
      { brand: "Not.A/Brand", version: "24" },
    ];
    const fullVersionList = [
      { brand: "Chromium", version: full },
      { brand: "Google Chrome", version: full },
      { brand: "Not.A/Brand", version: "24.0.0.0" },
    ];
    const high: Record<string, unknown> = {
      architecture: "x86",
      bitness: "64",
      brands,
      fullVersionList,
      mobile: false,
      model: "",
      platform: "macOS",
      platformVersion: "10.15.7",
      uaFullVersion: full,
      wow64: false,
    };
    const uaData = {
      brands,
      mobile: false,
      platform: "macOS",
      getHighEntropyValues: (hints: string[]) => {
        const out: Record<string, unknown> = {
          brands,
          mobile: false,
          platform: "macOS",
        };
        for (const h of hints || []) if (h in high) out[h] = high[h];
        return Promise.resolve(out);
      },
      toJSON: () => ({ brands, mobile: false, platform: "macOS" }),
    };
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      get: () => uaData,
    });
  }
} catch {
  // Best-effort only.
}
