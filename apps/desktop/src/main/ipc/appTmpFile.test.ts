// Decrypted originals used to be written to `tmpdir()` with no mode and no cleanup: the
// default umask makes them world-READABLE in a directory every local account can list, and
// nothing ever deleted them. Every "open my payslip" therefore left a permanent cleartext
// copy of a document `db/` keeps encrypted at rest.
//
// This pins the three properties that fix it: a 0700 directory, a 0600 file, and removal on
// `will-quit` — plus the brand-slug prefix `readGate.ts` keys its OS-temp allow-list on.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, sep } from "node:path";

const quitHandlers: (() => void)[] = [];
vi.mock("electron", () => ({
  app: {
    on: (ev: string, fn: () => void) => {
      if (ev === "will-quit") quitHandlers.push(fn);
    },
  },
}));

import { writeAppTmpFile, cleanupAppTmpFiles } from "./appTmpFile";
import { BRAND } from "@openmasq/branding";

const mode = (p: string): string => (statSync(p).mode & 0o777).toString(8);

beforeEach(() => {
  cleanupAppTmpFiles();
});

describe("app-owned temp files", () => {
  it("writes the bytes 0600, inside a 0700 directory of its own", async () => {
    const path = await writeAppTmpFile("open", "bulletin de paie.pdf", Buffer.from("SECRET"));
    expect(readFileSync(path, "utf8")).toBe("SECRET");
    expect(mode(path)).toBe("600"); // no other local account can read it
    expect(mode(dirname(path))).toBe("700"); // …nor even list the directory
  });

  it("keeps the real name and extension, so the OS opens it with the right app", async () => {
    const path = await writeAppTmpFile("open", "contrat.pdf", Buffer.from("x"));
    expect(path.endsWith(`${sep}contrat.pdf`)).toBe(true);
  });

  // `readGate.ts` allows a renderer read under the OS temp dir ONLY when the first segment
  // below it starts with the brand slug — the prefix is a gate input, not decoration.
  it("puts the directory directly under tmpdir with the brand-slug prefix", async () => {
    const path = await writeAppTmpFile("export", "export.pdf", Buffer.from("x"));
    const firstSeg = dirname(path).slice(tmpdir().length + 1);
    expect(firstSeg.split(sep)).toHaveLength(1);
    expect(firstSeg.startsWith(BRAND.slug)).toBe(true);
  });

  it("gives each write its own unguessable directory", async () => {
    const a = await writeAppTmpFile("open", "same.pdf", Buffer.from("A"));
    const b = await writeAppTmpFile("open", "same.pdf", Buffer.from("B"));
    expect(dirname(a)).not.toBe(dirname(b));
    expect(readFileSync(a, "utf8")).toBe("A");
  });

  it("is removed when the app quits — the cleartext copy does not outlive the session", async () => {
    const path = await writeAppTmpFile("open", "payslip.pdf", Buffer.from("SECRET"));
    expect(existsSync(path)).toBe(true);
    expect(quitHandlers).toHaveLength(1); // the hook is installed once, on first use
    for (const fn of quitHandlers) fn();
    expect(existsSync(path)).toBe(false);
    expect(existsSync(dirname(path))).toBe(false);
  });
});
