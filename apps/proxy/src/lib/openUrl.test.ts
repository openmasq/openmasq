import { describe, expect, it } from "vitest";
import { openerCommand, openInBrowser } from "./openUrl";

describe("opening the console in the browser", () => {
  it("uses the platform's own opener, and only that", () => {
    const url = "http://127.0.0.1:8787/console?t=abc";
    expect(openerCommand(url, "darwin")).toEqual(["open", url]);
    expect(openerCommand(url, "linux")).toEqual(["xdg-open", url]);
    // The empty title: without it `start` takes the URL as the window title and opens nothing.
    expect(openerCommand(url, "win32")).toEqual(["cmd", "/c", "start", "", url]);
  });

  /** Best-effort, like the clipboard: no opener is a note on the card, never a crash. */
  it("reports a missing opener instead of throwing", async () => {
    const platform = "linux" as const; // xdg-open is absent on this machine, which is the point
    expect(await openInBrowser("http://127.0.0.1:8787/console?t=abc", process.platform === "linux" ? "win32" : platform)).toBe(false);
  });
});
