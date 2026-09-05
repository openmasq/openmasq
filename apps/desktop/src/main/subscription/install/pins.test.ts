// Root rule 7, made checkable: everything this process may download to RUN is named here,
// with its origin and its sha256 — and nothing else resolves to a download.
import { describe, expect, it } from "vitest";
import { CLAUDE_PIN_VERSION, CODEX_PIN_VERSION, claudePlatformKey, codexTriple, installPin } from "./pins";

const HEX64 = /^[a-f0-9]{64}$/;
const PLATFORMS: [NodeJS.Platform, string][] = [
  ["darwin", "arm64"],
  ["darwin", "x64"],
  ["linux", "arm64"],
  ["linux", "x64"],
  ["win32", "arm64"],
  ["win32", "x64"],
];

describe("installPin", () => {
  it("claude: Anthropic's own release bucket, the pinned version, a sha256", () => {
    const pin = installPin("claude", "darwin", "arm64");
    expect(pin?.url).toBe(`https://downloads.claude.ai/claude-code-releases/${CLAUDE_PIN_VERSION}/darwin-arm64/claude`);
    expect(pin?.sha256).toMatch(HEX64);
    expect(pin?.layout).toBe("binary");
    expect(pin?.allowHosts).toEqual(["downloads.claude.ai"]);
  });

  it("claude on Windows is the .exe", () => {
    expect(installPin("claude", "win32", "x64")?.url.endsWith("/win32-x64/claude.exe")).toBe(true);
  });

  it("codex: OpenAI's GitHub release for the pinned tag, the package tarball", () => {
    const pin = installPin("codex", "darwin", "arm64");
    expect(pin?.url).toBe(
      `https://github.com/openai/codex/releases/download/rust-v${CODEX_PIN_VERSION}/codex-package-aarch64-apple-darwin.tar.gz`,
    );
    expect(pin?.layout).toBe("tgz");
    expect(pin?.allowHosts).toContain("release-assets.githubusercontent.com");
    expect(installPin("codex", "win32", "x64")?.url).toContain("x86_64-pc-windows-msvc");
    expect(installPin("codex", "linux", "x64")?.url).toContain("x86_64-unknown-linux-musl");
  });

  it("every shipped platform has a pin with a well-formed digest, a size and https", () => {
    for (const [platform, arch] of PLATFORMS) {
      for (const cli of ["claude", "codex"] as const) {
        const pin = installPin(cli, platform, arch);
        expect(pin, `${cli} ${platform}-${arch}`).not.toBeNull();
        expect(pin?.sha256).toMatch(HEX64);
        expect(pin?.size).toBeGreaterThan(50_000_000);
        expect(pin?.url.startsWith("https://")).toBe(true);
      }
    }
  });

  it("antigravity is never installable, nor is an unshipped platform", () => {
    expect(installPin("antigravity", "darwin", "arm64")).toBeNull();
    expect(installPin("claude", "freebsd", "x64")).toBeNull();
    expect(installPin("codex", "darwin", "ia32")).toBeNull();
    expect(claudePlatformKey("sunos", "x64")).toBeNull();
    expect(codexTriple("darwin", "ppc64")).toBeNull();
  });
});
