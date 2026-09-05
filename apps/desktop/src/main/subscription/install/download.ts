/**
 * ONE pinned artefact, from its official origin, to ONE file — streamed to disk and into
 * sha256 at the same time, so a 200 MB binary is never whole in memory. Resolves only if
 * the digest AND the length equal the pin; otherwise the file is removed and it throws.
 * Every hop goes through `safeFetch` (per-hop SSRF, host allow-list, cap, timeout).
 */
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { safeFetch } from "../../net/net";
import type { InstallPin } from "./pins";

const TIMEOUT_MS = 20 * 60 * 1000;
/** Progress is reported at most once per MiB, and once at the end. */
const PROGRESS_STEP = 1 << 20;

export class PinMismatchError extends Error {
  constructor() {
    super("downloaded artefact does not match its pin");
    this.name = "PinMismatchError";
  }
}

export async function downloadPinned(
  pin: InstallPin,
  dest: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const fd = openSync(dest, "w", 0o600);
  const hash = createHash("sha256");
  let received = 0;
  let reported = 0;
  try {
    await safeFetch(pin.url, {
      accept: "binary",
      maxBytes: pin.size,
      timeoutMs: TIMEOUT_MS,
      allowHosts: pin.allowHosts,
      source: `cli-install:${pin.cli}`,
      sink: (chunk) => {
        writeSync(fd, chunk);
        hash.update(chunk);
        received += chunk.byteLength;
        if (onProgress && received - reported >= PROGRESS_STEP) {
          reported = received;
          onProgress(received, pin.size);
        }
      },
    });
  } finally {
    closeSync(fd);
  }
  if (received !== pin.size || hash.digest("hex") !== pin.sha256) {
    try {
      unlinkSync(dest);
    } catch {
      /* already gone */
    }
    throw new PinMismatchError();
  }
  onProgress?.(received, pin.size);
}
