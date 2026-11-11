import { existsSync, rmSync, writeFileSync } from "node:fs";

/**
 * WHICH secrets files this install wrote in the clear — the one fact a reader needs before
 * it takes cleartext bytes for a store that is meant to be sealed.
 *
 * A store falls back to base64 cleartext only when the OS keychain cannot seal it
 * (`atRestPolicy.ts`). That write leaves a marker beside the file (`<file>.plain`), and a
 * sealed write removes it. A reader then takes cleartext ONLY where the marker stands: bytes
 * that parse as a store but were never written by the fallback are not this install's, and
 * are refused (`safeStore.ts` `decodeStore` / `decodeSecret`), which reads as "present but
 * not readable" — an empty key list, a sign-in asked again — never as the planted content.
 *
 * ⚠️ RESIDUAL, said plainly: the marker is an unsealed file. It cannot be otherwise, since it
 * is written exactly when there is no key to seal it with. Someone who can write this folder
 * AND knows to add the marker is not stopped; what is stopped is cleartext dropped over a
 * sealed store, and a sealed store never downgrades silently. Pinned by `plainMarker.test.ts`.
 */
const marker = (file: string): string => `${file}.plain`;

/** Called by a fallback write, BEFORE the bytes: a crash in between leaves a marker with no
 *  cleartext (harmless), never cleartext with no marker (unreadable). */
export function notePlaintextWrite(file: string): void {
  try {
    writeFileSync(marker(file), "", { mode: 0o600 });
  } catch {
    /* no marker ⇒ the next read refuses the cleartext: fail closed */
  }
}

/** Called after a SEALED write reached the disk: this store is no longer in the clear. */
export function noteSealedWrite(file: string): void {
  try {
    rmSync(marker(file), { force: true });
  } catch {
    /* a marker left behind only keeps a cleartext read possible; the file itself is sealed */
  }
}

/** Did this install write `file` in the clear (and not seal it since)? */
export function plaintextWasWritten(file: string): boolean {
  return existsSync(marker(file));
}

// --- Saying it -----------------------------------------------------------------------------
// A refusal is reported as a CODE, never a path (the path carries the account id). The
// listener is wired by `runtime/errorReport.ts`; refusals before it exists are kept, bounded.

let listener: (() => void) | null = null;
let waiting = 0;
const warned = new Set<string>();

/** One refusal: logged once per file per process, counted for the listener. */
export function plaintextRefused(file: string): void {
  if (warned.has(file)) return;
  warned.add(file);
  console.warn("[store] cleartext found where a sealed store is expected — not read");
  if (listener) listener();
  else if (waiting < 8) waiting++;
}

export function onPlaintextRefused(fn: () => void): void {
  listener = fn;
  for (; waiting > 0; waiting--) fn();
}

/** Tests only. */
export function resetPlainMarker(): void {
  listener = null;
  waiting = 0;
  warned.clear();
}
