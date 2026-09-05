/**
 * WHAT the app may download to install a subscription CLI — and nothing else.
 *
 * Root rule 7: a binary fetched over the network and then RUN from a privileged process
 * is only acceptable when it comes from the vendor's canonical origin AND matches a
 * sha256 pinned HERE, in code reviewed with the change. A TLS-only fetch of « latest »
 * would be arbitrary code execution by whoever controls the host that day. So both CLIs
 * are pinned to ONE version each, and bumping a pin is a deliberate change:
 *
 * - **claude** — Anthropic's own release bucket (`downloads.claude.ai`, the origin the
 *   official `install.sh` / `install.ps1` read). The checksums are those of its
 *   `<version>/manifest.json`, copied here on 2026-09-05. Once installed the CLI keeps
 *   itself current through its OWN updater (`claude update`, signed by Anthropic): the
 *   pin is the version we hand over, not a ceiling.
 * - **codex** — OpenAI's GitHub Releases for the `rust-v<version>` tag, the
 *   `codex-package-<triple>.tar.gz` asset (Apache-2.0: `bin/codex`,
 *   `bin/codex-code-mode-host`, its `rg` and `zsh` — the same layout the npm package
 *   vendors). Checksums from the release's `codex-package_SHA256SUMS`. ⚠️ The isolation
 *   flags in `codexEngine.ts` were MEASURED on this exact version; a bump re-measures
 *   them (`codexToolsTurn.integration.test.ts`) before it lands.
 *
 * `antigravity` is deliberately absent: its terms forbid third-party software access
 * (`../CLAUDE.md`), and installing it ourselves would make the app the third party.
 */
import type { SubscriptionCliId } from "../resolveCli";

export type InstallableCli = "claude" | "codex";

export interface InstallPin {
  cli: InstallableCli;
  version: string;
  url: string;
  sha256: string;
  /** Bytes on the wire — the progress bar's denominator, and the cap's basis. */
  size: number;
  /** Hosts allowed on EVERY hop: GitHub 302s an asset to its own CDN host. */
  allowHosts: string[];
  /** `binary` = the file IS the executable · `tgz` = a tarball to extract. */
  layout: "binary" | "tgz";
}

export const CLAUDE_PIN_VERSION = "2.1.261";
export const CODEX_PIN_VERSION = "0.149.1";

interface Digest {
  sha256: string;
  size: number;
}

const CLAUDE_BASE = "https://downloads.claude.ai/claude-code-releases";
const CLAUDE: Readonly<Record<string, Digest>> = {
  "darwin-arm64": { sha256: "5efecaff231b798be3c66def9be54183623b328b80eaef17f93c43987024e82a", size: 199241568 },
  "darwin-x64": { sha256: "2cbc002b32778bd70aa2e668ada920c54d9aacd91b71dbd5619c01ca148ae533", size: 208009440 },
  "linux-arm64": { sha256: "7bbed5a9b0fc2e4ec67bad3490d06ca91b86d6b037d47520b7898951757d1b8a", size: 215211432 },
  "linux-x64": { sha256: "4ae40dd1784e85753e742e09f267d29ecbb82890361ad3817d27560866d364a6", size: 215641584 },
  "win32-arm64": { sha256: "df26e336df846f4b68edda1021af5aecc1f8172d9f045ee33a480916385b35f9", size: 209778336 },
  "win32-x64": { sha256: "f2f5d1a155167488aeb32cd263e15436253c7b1681ae147c9e73e4d6bbc3c852", size: 218728608 },
};

const CODEX_BASE = `https://github.com/openai/codex/releases/download/rust-v${CODEX_PIN_VERSION}`;
const CODEX: Readonly<Record<string, Digest>> = {
  "aarch64-apple-darwin": { sha256: "4cbb17468b5d86b4b182a28c016d62e9d273a241cec04885ccfae76e6983ae3f", size: 110095583 },
  "x86_64-apple-darwin": { sha256: "4c50fb92bb238a4067009d4a99c13351325c8840da91edd0ce4e5b7a21d53bc3", size: 119660659 },
  "aarch64-pc-windows-msvc": { sha256: "caba0a92e2bb74f7c5ce71cbcc1271aceba1c11e67997ee278162b0fa4ee74dc", size: 124885100 },
  "x86_64-pc-windows-msvc": { sha256: "e302697785b0761833779fe2d7b65614d6d156e8e6b8b9fa9725b6503d552613", size: 134545938 },
  "aarch64-unknown-linux-musl": { sha256: "57095f9f4ced36d8e173f67e26c5c142d5b3e1e1984bbcae35684209ed236a9b", size: 113760656 },
  "x86_64-unknown-linux-musl": { sha256: "1e8531ae5f6dea3c6e11e53e74cc5ac81bf1ba597f9b296fb112d6ea30fdaf5d", size: 122578702 },
};

/** Anthropic's platform key (`<os>-<arch>`), or `null` for a platform it doesn't ship. */
export function claudePlatformKey(platform: NodeJS.Platform, arch: string): string | null {
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32") return null;
  if (arch !== "arm64" && arch !== "x64") return null;
  return `${platform}-${arch}`;
}

/** The Rust target triple OpenAI names its assets by, or `null`. */
export function codexTriple(platform: NodeJS.Platform, arch: string): string | null {
  const cpu = arch === "arm64" ? "aarch64" : arch === "x64" ? "x86_64" : null;
  if (!cpu) return null;
  if (platform === "darwin") return `${cpu}-apple-darwin`;
  if (platform === "win32") return `${cpu}-pc-windows-msvc`;
  if (platform === "linux") return `${cpu}-unknown-linux-musl`;
  return null;
}

/** The ONE thing this build may download for `cli` on this machine, or `null`. */
export function installPin(cli: SubscriptionCliId, platform: NodeJS.Platform, arch: string): InstallPin | null {
  if (cli === "claude") {
    const key = claudePlatformKey(platform, arch);
    const d = key ? CLAUDE[key] : undefined;
    if (!key || !d) return null;
    const bin = platform === "win32" ? "claude.exe" : "claude";
    return {
      cli,
      version: CLAUDE_PIN_VERSION,
      url: `${CLAUDE_BASE}/${CLAUDE_PIN_VERSION}/${key}/${bin}`,
      ...d,
      allowHosts: ["downloads.claude.ai"],
      layout: "binary",
    };
  }
  if (cli === "codex") {
    const triple = codexTriple(platform, arch);
    const d = triple ? CODEX[triple] : undefined;
    if (!triple || !d) return null;
    return {
      cli,
      version: CODEX_PIN_VERSION,
      url: `${CODEX_BASE}/codex-package-${triple}.tar.gz`,
      ...d,
      allowHosts: ["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"],
      layout: "tgz",
    };
  }
  return null;
}
