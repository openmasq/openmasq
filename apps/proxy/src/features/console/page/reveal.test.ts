import { describe, expect, it } from "vitest";
import { exportDocument, exportableEvent, exportFilename, mayReveal } from "./reveal";

/* The page's privacy boundary, which had no test at all while it lived inside the asset.
   A real value reaches the screen or a file only when the RUN sent it and the READER asked
   for it — two conditions, never one. */
describe("a real value needs both conditions", () => {
  it("is the AND of what the run sent and what the reader asked", () => {
    expect(mayReveal(true, true)).toBe(true);
    expect(mayReveal(true, false)).toBe(false);
    expect(mayReveal(false, true)).toBe(false); // --no-console-reveal: nothing to show
    expect(mayReveal(false, false)).toBe(false);
  });

  /** The toggle can be ON in a run that sent nothing — the button is armed from the run, but
   *  a page restored from bfcache, or one whose state was set before the connect frame
   *  arrived, must not print what it never received. */
  it("never lets the toggle alone open the door", () => {
    const ev = { items: [{ tok: "Mattéo Pons", real: "Jean Dupont" }] };
    expect(exportableEvent(ev, mayReveal(false, true)).items?.[0]).toEqual({ tok: "Mattéo Pons" });
  });
});

describe("what leaves the page as a file", () => {
  const EVENTS = [
    { path: "/v1/messages", items: [{ tok: "Mattéo Pons", real: "Jean Dupont" }] },
    { path: "/mcp", items: [{ tok: "cx-8821", real: "cx-1042" }, { tok: "Oslen Group" }] },
  ];

  it("strips every original when the pair does not allow them", () => {
    const doc = exportDocument(EVENTS, { sent: true, shown: false });
    expect(doc.reveal).toBe(false);
    const reals = JSON.stringify(doc).match(/"real"/g);
    expect(reals).toBeNull();
    // …while the substitutes, which already left the machine, are all still there.
    expect(JSON.stringify(doc)).toContain("Mattéo Pons");
    expect(JSON.stringify(doc)).toContain("Oslen Group");
  });

  it("keeps them when it does, and says so on the file itself", () => {
    const doc = exportDocument(EVENTS, { sent: true, shown: true });
    expect(doc.reveal).toBe(true);
    expect(doc.events[0]?.items?.[0]?.real).toBe("Jean Dupont");
  });

  /** The screen keeps drawing from the same objects while the file is being built. Stripping
   *  in place emptied the rows behind the download. */
  it("never reaches back into the log it copied from", () => {
    const live = [{ items: [{ tok: "Mattéo Pons", real: "Jean Dupont" }] }];
    exportDocument(live, { sent: true, shown: false });
    expect(live[0]?.items[0]?.real).toBe("Jean Dupont");
  });

  it("survives an event with no items and a missing one", () => {
    expect(exportableEvent(null, true)).toEqual({});
    expect(exportableEvent({ path: "/healthz" }, false)).toEqual({ path: "/healthz" });
  });

  it("names the file after the moment, in a form every filesystem takes", () => {
    const name = exportFilename(new Date("2026-09-13T10:04:07.123Z"));
    expect(name).toBe("openmasq-journal-2026-09-13-10-04-07.json");
    expect(name).not.toMatch(/[:T]/);
  });
});
