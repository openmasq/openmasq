/**
 * Read the CPU architecture out of a native binary's header — Mach-O (macOS) and PE
 * (Windows), no external tool (`file` doesn't exist on a Windows runner).
 *
 * Why this exists: the bundled Python runtime can now be baked for a target that is NOT
 * the machine baking it (`bake-python-runtime.ts` cross mode — pip resolves wheels by
 * platform TAG). A tag is a claim about a wheel's filename; this reads what the bytes
 * actually are. The failure it guards against is silent and expensive: a runtime that
 * looks baked, ships signed and notarised, and dies on the user's machine at the first
 * `import numpy` because the extension modules are for the other CPU.
 *
 * Pure (Buffer in, arch names out) so it is unit-tested rather than argued about.
 */

/** The architectures we ship. Matches electron-builder's `${arch}` vocabulary. */
export type BinArch = "x64" | "arm64";

// Mach-O. A "fat" (universal) file is a header listing N slices, each with its own
// cputype — a universal2 wheel is valid on BOTH arches, so it must not read as "wrong".
const MH_MAGIC_64 = 0xfeedfacf; // thin, little-endian (the only kind Apple ships now)
const MH_CIGAM_64 = 0xcffaedfe; // same, byte-swapped
const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const CPU_TYPE: Record<number, BinArch> = {
  0x01000007: "x64", // CPU_TYPE_X86_64
  0x0100000c: "arm64", // CPU_TYPE_ARM64
};

// PE (COFF) machine field.
const PE_MACHINE: Record<number, BinArch> = {
  0x8664: "x64", // IMAGE_FILE_MACHINE_AMD64
  0xaa64: "arm64", // IMAGE_FILE_MACHINE_ARM64
};

/** Every architecture the binary can run on, or `[]` when the bytes aren't a native
 *  binary we recognise (a pure-Python `.so`-named data file, a stub, a text file). An
 *  empty result is "don't know", never "wrong" — the caller decides. */
export function binaryArchs(buf: Buffer): BinArch[] {
  if (buf.length < 8) return [];

  // ── Mach-O fat: big-endian magic, then a count and that many 20-byte entries.
  const beMagic = buf.readUInt32BE(0);
  if (beMagic === FAT_MAGIC || beMagic === FAT_MAGIC_64) {
    const count = buf.readUInt32BE(4);
    const out: BinArch[] = [];
    // Guard the count: a truncated/hostile header must not walk us off the buffer.
    for (let i = 0; i < Math.min(count, 32); i++) {
      const off = 8 + i * (beMagic === FAT_MAGIC_64 ? 32 : 20);
      if (off + 4 > buf.length) break;
      const arch = CPU_TYPE[buf.readUInt32BE(off)];
      if (arch && !out.includes(arch)) out.push(arch);
    }
    return out;
  }

  // ── Mach-O thin: magic then cputype, in the file's own byte order.
  const leMagic = buf.readUInt32LE(0);
  if (leMagic === MH_MAGIC_64) {
    const arch = CPU_TYPE[buf.readUInt32LE(4)];
    return arch ? [arch] : [];
  }
  if (leMagic === MH_CIGAM_64) {
    const arch = CPU_TYPE[buf.readUInt32BE(4)];
    return arch ? [arch] : [];
  }

  // ── PE: "MZ", the PE header offset at 0x3c, "PE\0\0", then the machine word.
  if (buf.length > 0x40 && buf[0] === 0x4d && buf[1] === 0x5a) {
    const peOff = buf.readUInt32LE(0x3c);
    if (peOff + 6 <= buf.length && buf.readUInt32LE(peOff) === 0x00004550) {
      const arch = PE_MACHINE[buf.readUInt16LE(peOff + 4)];
      return arch ? [arch] : [];
    }
  }

  return [];
}

/** Whether a binary can run on `want`. Unrecognised bytes ⇒ `true`: this check exists to
 *  catch the WRONG architecture, not to police every file in site-packages, and a bake
 *  that refused everything it couldn't parse would be a bake nobody can run. */
export function runsOn(buf: Buffer, want: BinArch): boolean {
  const archs = binaryArchs(buf);
  return archs.length === 0 || archs.includes(want);
}

/** The `${arch}` of a build triple (`darwin-x64` → `x64`). Null when it names an arch we
 *  don't ship, so a caller can skip the check rather than assert against a guess. */
export function archOfTriple(triple: string): BinArch | null {
  const arch = triple.split("-")[1];
  return arch === "x64" || arch === "arm64" ? arch : null;
}
