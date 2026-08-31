/**
 * WHICH environment this instance opens — and where that choice is written.
 *
 * ⚠️ **The pointer CANNOT live in `updates.json`.** That file is in `userData`,
 * whose path depends precisely on the environment (`profile.ts`): we can't read
 * inside the folder we haven't chosen yet. So it lives in the BASE `userData`
 * folder — the bare path, production's — under a name of its own. A single line, no
 * secret, and the one thing a staging profile writes outside its own home.
 *
 * ⚠️ **What is persisted is a NAME, never an address** (`environments/` says why)
 * — with ONE deliberate and bounded exception: the SELF-HOSTED stack (`custom`), whose
 * addresses live in this same file, but which is HONORED only in a build that
 * allows it (`OPENMASQ_ALLOW_CUSTOM_STACK=1`) and only if they pass
 * validation again on EVERY read (`environments/customStack.ts`). An official binary that
 * finds a `custom` pointer opens production; a `custom` pointer with tampered
 * addresses too. An unknown value, an unreadable file, broken JSON ⇒ production.
 * Fail-closed has a precise meaning here: the default isn't "nothing", it's the binary's
 * own environment.
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

/** What the pointer says, once read back and FILTERED: an honorable environment, and the
 *  entered stack if it's valid — kept even when the current environment is a
 *  different one, so the screen can pre-fill it and so it can be returned to. */
export interface EnvPointer {
  env: EnvName;
  custom: CustomStack | null;
}

/**
 * The pointer, in full.
 *
 * `fallback` answers as long as NO choice has been written — and it's ALWAYS production:
 * the environment is no longer inferred from the channel (single-artifact contract, see
 * `../environments`). With no pointer, nothing changes for anyone.
 *
 * `allowed` = does the build honor an entered stack; injected for the test, baked otherwise.
 */
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
    // The stack is kept only if it passes validation AGAIN AND the build honors it:
    // an address hand-written into the file is not an accepted address.
    const verdict = allowed && raw?.custom ? validateCustomStack(raw.custom) : null;
    const custom = verdict?.ok ? verdict.stack : null;
    if (!isEnvName(raw?.env)) return { env: fallback, custom };
    if (raw.env === "custom") return { env: custom ? "custom" : fallback, custom };
    return { env: raw.env, custom };
  } catch {
    // File absent (the normal case), unreadable, or broken JSON — in all three cases the
    // default knows where to go. Nothing is ever thrown here: this runs before `whenReady`, and an
    // exception here is a dead launch with no window to explain it.
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

/** Write the choice. Best-effort: a full disk must not kill a launch — at worst
 *  the app reopens its previous environment on the next startup. `custom` is the entered
 *  stack to KEEP (the one being applied, or the one already known when switching to a
 *  baked environment) — `null` forgets it. */
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
