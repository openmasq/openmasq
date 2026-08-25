import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { assertSafeFileId, safeExt, safeFileName, isUnderDir, assertUnderDir } from "./safePath";

describe("assertSafeFileId — the on-disk-path splice gate", () => {
  it("accepts the ids we actually mint (base36 uid, uuid, prefixed)", () => {
    for (const id of ["k9x2ab3cd1e", "1f9a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b", "python_1", "a.b-c"]) {
      expect(() => assertSafeFileId(id)).not.toThrow();
    }
  });

  it("rejects a traversal id before it can escape the files dir", () => {
    for (const id of [
      "../../../../etc/passwd",
      "..",
      "a/../../b",
      "sub/dir",
      "back\\slash",
      "with space",
      "nul\0byte",
      "",
      "x".repeat(129),
    ]) {
      expect(() => assertSafeFileId(id)).toThrow();
    }
  });

  it("rejects a non-string (a hostile renderer can send anything over IPC)", () => {
    for (const id of [undefined, null, 42, {}, ["a"]] as unknown[]) {
      expect(() => assertSafeFileId(id)).toThrow();
    }
  });
});

describe("safeExt", () => {
  it("keeps a plain lower-cased extension", () => {
    expect(safeExt("cr.pdf")).toBe(".pdf");
    expect(safeExt("Report.PNG")).toBe(".png");
    expect(safeExt("archive.tar.gz")).toBe(".gz");
  });
  it("drops anything that isn't a single alnum extension", () => {
    expect(safeExt("noext")).toBe("");
    expect(safeExt("x.")).toBe("");
    expect(safeExt("x.<script>")).toBe("");
    expect(safeExt("x./../../y")).toBe("");
    expect(safeExt(42 as unknown)).toBe("");
  });
});

describe("safeFileName — sanitised basename for a generated (opened) file", () => {
  it("strips any directory part, either separator (the traversal vector)", () => {
    expect(safeFileName("../../../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Windows\\evil.exe")).toBe("evil.exe");
  });
  it("replaces the cross-OS illegal chars and control codes, keeping the extension", () => {
    expect(safeFileName('a?b*c|d".pdf')).toBe("a_b_c_d_.pdf");
    expect(safeFileName("a\x00b\x1fc.pdf")).toBe("a_b_c.pdf");
  });
  it("keeps a legal internal name unchanged (internal dots / # / spaces are fine)", () => {
    expect(safeFileName("re..port.pdf")).toBe("re..port.pdf");
    expect(safeFileName("in voice#1.pdf")).toBe("in voice#1.pdf");
    expect(safeFileName("console.log")).toBe("console.log"); // NOT the reserved `con`
  });
  it("neutralises reserved names (pure dots + Windows devices)", () => {
    expect(safeFileName("CON")).toBe("fichier");
    expect(safeFileName("nul.txt")).toBe("fichier");
    expect(safeFileName("LPT1.pdf")).toBe("fichier");
    expect(safeFileName("...")).toBe("fichier");
  });
  it("strips trailing dots/spaces (illegal on some Windows FS)", () => {
    expect(safeFileName("report.pdf.. ")).toBe("report.pdf");
  });
  it("caps the length to a filesystem-safe byte budget", () => {
    const out = safeFileName("a".repeat(400) + ".pdf");
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(200);
  });
  it("never returns empty — falls back to a stable name", () => {
    expect(safeFileName("")).toBe("fichier");
    expect(safeFileName(undefined)).toBe("fichier");
    expect(safeFileName("////")).toBe("fichier");
  });
});

describe("isUnderDir / assertUnderDir — dir confinement", () => {
  const root = join("/var", "app", "files");
  it("accepts a child and the dir itself", () => {
    expect(isUnderDir(join(root, "a-original.pdf"), root)).toBe(true);
    expect(isUnderDir(root, root)).toBe(true);
  });
  it("rejects an escape (including a `..` splice)", () => {
    expect(isUnderDir(join(root, "..", "..", "secret"), root)).toBe(false);
    expect(isUnderDir("/etc/passwd", root)).toBe(false);
    // a sibling with the same prefix must NOT count as inside
    expect(isUnderDir("/var/app/files-evil/x", root)).toBe(false);
    expect(() => assertUnderDir("/etc/passwd", root)).toThrow();
  });
});
