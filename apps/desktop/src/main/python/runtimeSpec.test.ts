import { describe, it, expect } from "vitest";
import {
  TARBALL,
  TARBALL_SHA256,
  isPruned,
  runtimeSignature,
  pbsUrl,
} from "./runtimeSpec";

/** Pure unit tests (no Electron): the build descriptor must stay coherent — every
 *  supported triple has both a tarball name AND a pinned digest, the prune globs keep
 *  what the runtime needs and drop the dead weight, and the signature is deterministic. */
describe("runtimeSpec", () => {
  it("has a pinned sha256 for every supported tarball", () => {
    for (const key of Object.keys(TARBALL)) {
      expect(TARBALL_SHA256[key], `sha256 for ${key}`).toMatch(/^[0-9a-f]{64}$/);
    }
    // and no dangling digest without a tarball
    for (const key of Object.keys(TARBALL_SHA256)) expect(TARBALL[key]).toBeTruthy();
  });

  it("builds a PBS release URL for a tarball", () => {
    const name = TARBALL["darwin-arm64"]!;
    expect(pbsUrl(name)).toBe(
      `https://github.com/astral-sh/python-build-standalone/releases/download/20250612/${name}`,
    );
  });

  it("prunes tests/pip but keeps the runtime essentials", () => {
    // dropped
    expect(isPruned("numpy/tests/test_foo.py")).toBe(true);
    expect(isPruned("pandas/tests")).toBe(true);
    expect(isPruned("pip/__init__.py")).toBe(true);
    expect(isPruned("setuptools/_core.py")).toBe(true);
    // KEPT — needed for fast imports and version metadata
    expect(isPruned("numpy/__pycache__/__init__.cpython-312.pyc")).toBe(false);
    expect(isPruned("matplotlib/pyplot.py")).toBe(false);
    expect(isPruned("matplotlib-3.10.3.dist-info/METADATA")).toBe(false);
  });

  it("produces a deterministic, layout-tagged signature", () => {
    const sig = runtimeSignature();
    expect(sig).toBe(runtimeSignature());
    expect(sig).toMatch(/^l\d+\|3\.12\.11\+20250612\|[0-9a-f]{16}$/);
  });
});
