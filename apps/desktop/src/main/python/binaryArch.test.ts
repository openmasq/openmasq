import { describe, expect, it } from "vitest";
import { archOfTriple, binaryArchs, runsOn } from "./binaryArch";

// The bundled Python runtime can be baked for a target that is not the machine baking it,
// and pip resolves wheels by platform TAG — a claim about a filename. These pin the reader
// that checks the BYTES instead, because the failure mode it guards is invisible until a
// user's app dies at `import numpy`.

/** Mach-O thin, little-endian: magic + cputype. */
const machO = (cpuType: number): Buffer => {
  const b = Buffer.alloc(32);
  b.writeUInt32LE(0xfeedfacf, 0);
  b.writeUInt32LE(cpuType, 4);
  return b;
};

/** Mach-O fat: big-endian magic, slice count, then 20-byte entries (cputype first). */
const fat = (...cpuTypes: number[]): Buffer => {
  const b = Buffer.alloc(8 + cpuTypes.length * 20);
  b.writeUInt32BE(0xcafebabe, 0);
  b.writeUInt32BE(cpuTypes.length, 4);
  cpuTypes.forEach((t, i) => b.writeUInt32BE(t, 8 + i * 20));
  return b;
};

/** PE: "MZ", the header offset at 0x3c, "PE\0\0", machine. */
const pe = (machine: number): Buffer => {
  const b = Buffer.alloc(0x100);
  b.write("MZ", 0, "ascii");
  b.writeUInt32LE(0x80, 0x3c);
  b.writeUInt32LE(0x00004550, 0x80);
  b.writeUInt16LE(machine, 0x84);
  return b;
};

const X86_64 = 0x01000007;
const ARM64 = 0x0100000c;

describe("binaryArchs", () => {
  it("reads a thin Mach-O of each arch", () => {
    expect(binaryArchs(machO(X86_64))).toEqual(["x64"]);
    expect(binaryArchs(machO(ARM64))).toEqual(["arm64"]);
  });

  it("reads BOTH slices of a universal2 binary", () => {
    // The case that must not read as "wrong arch": several wheels ship universal2, which
    // is valid on x64 AND arm64.
    expect(binaryArchs(fat(X86_64, ARM64))).toEqual(["x64", "arm64"]);
  });

  it("reads a PE of each arch", () => {
    expect(binaryArchs(pe(0x8664))).toEqual(["x64"]);
    expect(binaryArchs(pe(0xaa64))).toEqual(["arm64"]);
  });

  it("returns nothing for bytes that are not a native binary", () => {
    expect(binaryArchs(Buffer.from("# just a python file\n"))).toEqual([]);
    expect(binaryArchs(Buffer.alloc(4))).toEqual([]);
  });

  it("does not walk off a truncated fat header", () => {
    const b = fat(X86_64, ARM64).subarray(0, 20); // count says 2, bytes hold one
    expect(() => binaryArchs(b)).not.toThrow();
  });

  it("ignores an absurd slice count instead of looping on it", () => {
    const b = Buffer.alloc(64);
    b.writeUInt32BE(0xcafebabe, 0);
    b.writeUInt32BE(0xffffffff, 4);
    expect(() => binaryArchs(b)).not.toThrow();
  });
});

describe("runsOn", () => {
  it("accepts the matching arch and a universal binary", () => {
    expect(runsOn(machO(X86_64), "x64")).toBe(true);
    expect(runsOn(fat(X86_64, ARM64), "x64")).toBe(true);
    expect(runsOn(fat(X86_64, ARM64), "arm64")).toBe(true);
  });

  it("REFUSES the other arch — the whole point", () => {
    expect(runsOn(machO(ARM64), "x64")).toBe(false);
    expect(runsOn(pe(0xaa64), "x64")).toBe(false);
  });

  it("passes what it cannot parse — this gate catches wrong, not unknown", () => {
    expect(runsOn(Buffer.from("not a binary"), "x64")).toBe(true);
  });
});

describe("archOfTriple", () => {
  it("maps the triples we bake", () => {
    expect(archOfTriple("darwin-arm64")).toBe("arm64");
    expect(archOfTriple("darwin-x64")).toBe("x64");
    expect(archOfTriple("win32-x64")).toBe("x64");
  });

  it("returns null for an arch we don't ship, rather than guessing", () => {
    expect(archOfTriple("linux-armv7l")).toBeNull();
    expect(archOfTriple("nonsense")).toBeNull();
  });
});
