import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Packaged: no dev server, so "the app page" is exactly the bundled index.html.
vi.mock("electron", () => ({ app: { isPackaged: true }, dialog: {}, session: {}, shell: {}, systemPreferences: {} }));
vi.mock("../ipc/senderGate", () => ({ trustedHandle: () => {} }));
vi.mock("../i18n", () => ({ mainMessages: () => ({}) }));

const { isAppWebContents } = await import("./permissions");
const { APP_INDEX_HTML } = await import("../appPage");

const page = (url: string) => ({ getURL: () => url });

// The property: the microphone and clipboard grants go to the app's OWN page and to nothing
// that merely looks local.
describe("isAppWebContents — who may be granted the microphone", () => {
  it("grants the bundled app page", () => {
    expect(isAppWebContents(page(pathToFileURL(APP_INDEX_HTML).href))).toBe(true);
    expect(isAppWebContents(page(`${pathToFileURL(APP_INDEX_HTML).href}#/settings`))).toBe(true);
  });

  it("refuses another local file, a page on localhost, and remote content", () => {
    for (const url of [
      pathToFileURL(join(APP_INDEX_HTML, "..", "..", "Downloads", "page.html")).href,
      "file:///Users/someone/Downloads/invoice.html",
      "http://localhost:3000/",
      "http://127.0.0.1:8080/record",
      "https://localhost/",
      "https://example.com/",
      "about:blank",
      "",
    ]) {
      expect(isAppWebContents(page(url)), url).toBe(false);
    }
  });

  it("refuses when there is no page, or the page cannot say where it is", () => {
    expect(isAppWebContents(null)).toBe(false);
    expect(isAppWebContents(undefined)).toBe(false);
    expect(
      isAppWebContents({
        getURL: () => {
          throw new Error("destroyed");
        },
      }),
    ).toBe(false);
  });
});
