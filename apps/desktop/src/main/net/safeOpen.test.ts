import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { open: string[]; reveal: string[] } = { open: [], reveal: [] };
vi.mock("electron", () => ({
  shell: {
    openPath: async (p: string) => (calls.open.push(p), ""),
    showItemInFolder: (p: string) => calls.reveal.push(p),
    openExternal: async () => undefined,
  },
}));

const { isOpenableFile, safeOpenPath } = await import("./safeOpen");

// `openPath` on an executable RUNS it, and the name comes from an attachment or a file the
// model wrote: only documents, images and media are opened; anything else is revealed.
describe("safeOpenPath", () => {
  beforeEach(() => {
    calls.open = [];
    calls.reveal = [];
  });

  it("reveals an executable instead of running it", async () => {
    for (const name of ["run.bat", "setup.exe", "x.hta", "a.vbs", "go.command", "t.terminal", "page.html", "img.svg", "m.docm", "noext"]) {
      expect(await safeOpenPath(`/tmp/${name}`), name).toBe("revealed");
    }
    expect(calls.open).toEqual([]);
  });

  it("opens a document, an image or a media file in its default app", async () => {
    for (const name of ["contrat.pdf", "Notes.DOCX", "photo.jpeg", "data.csv", "voice.m4a"]) {
      expect(isOpenableFile(`/tmp/${name}`), name).toBe(true);
      expect(await safeOpenPath(`/tmp/${name}`)).toBe("opened");
    }
  });

  it("reads the LAST extension only — a double one does not smuggle", () => {
    expect(isOpenableFile("/tmp/facture.pdf.exe")).toBe(false);
    expect(isOpenableFile("C:\\Users\\x\\rapport.exe.pdf")).toBe(true);
  });
});
