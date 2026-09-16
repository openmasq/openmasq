/**
 * WHICH environment this instance opens, and where that choice is written: in the BASE
 * `userData` (the profile's path depends on the very choice being read, `profile.ts`).
 *
 * ⚠️ A NAME is persisted, never an address (`environments/`), with ONE bounded exception:
 * the SELF-HOSTED stack, HONORED only in a build that allows it and only if it passes
 * validation again on EVERY read (`environments/customStack.ts`). Unknown value,
 * unreadable file, tampered stack ⇒ production: fail-closed means the binary's own
 * environment, not "nothing".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ENV, isEnvName, type EnvName } from "../environments";
import { CUSTOM_STACK_ALLOWED, validateCustomStack, type CustomStack } from "../environments/customStack";

/** The file that carries the choice, in the BASE `userData`. */
export const ENV_POINTER_FILE = "environment.json";

/** The part of `fs` this needs — injected, so the module stays testable. */
export interface PointerIo {
  readFile(path: string): string;
  writeFile(path: string, contents: string): void;
}

const nodeIo: PointerIo = {
  readFile: (p) => readFileSync(p, "utf8"),
  writeFile: (p, c) => writeFileSync(p, c),
};

/** The pointer, FILTERED: an honorable environment, and the entered stack if valid (kept
 *  even under another environment, so the screen pre-fills it). */
export interface EnvPointer {
  env: EnvName;
  custom: CustomStack | null;
}

/** The pointer, in full. `fallback` answers while NO choice is written (always production,
 *  never the channel). `allowed` is injected for the test, baked otherwise. */
export function readEnvPointerFull(
  baseUserData: string,
  fallback: EnvName = DEFAULT_ENV,
  io: PointerIo = nodeIo,
  allowed: boolean = CUSTOM_STACK_ALLOWED,
): EnvPointer {
  try {
    const raw = JSON.parse(io.readFile(join(baseUserData, ENV_POINTER_FILE))) as {
      env?: unknown;
      custom?: unknown;
    };
    // Kept only if it passes validation AGAIN AND the build honors it.
    const verdict = allowed && raw?.custom ? validateCustomStack(raw.custom) : null;
    const custom = verdict?.ok ? verdict.stack : null;
    if (!isEnvName(raw?.env)) return { env: fallback, custom };
    if (raw.env === "custom") return { env: custom ? "custom" : fallback, custom };
    return { env: raw.env, custom };
  } catch {
    // Absent (the normal case), unreadable or broken: the default. Never throws (this runs
    // before `whenReady`, with no window to explain a crash).
    return { env: fallback, custom: null };
  }
}

/** The chosen environment alone — what the profile (`profile.ts`) needs to know. */
export function readEnvPointer(
  baseUserData: string,
  fallback: EnvName = DEFAULT_ENV,
  io: PointerIo = nodeIo,
): EnvName {
  return readEnvPointerFull(baseUserData, fallback, io).env;
}

/** Write the choice. Best-effort (a full disk must not kill a launch). `custom` is the
 *  entered stack to KEEP; `null` forgets it. */
export function writeEnvPointer(
  baseUserData: string,
  env: EnvName,
  io: PointerIo = nodeIo,
  custom: CustomStack | null = null,
): boolean {
  try {
    const body = custom ? { env, custom } : { env };
    io.writeFile(join(baseUserData, ENV_POINTER_FILE), JSON.stringify(body, null, 2));
    return true;
  } catch {
    return false;
  }
}

export { DEFAULT_ENV };
export type { EnvName };
