import { ipcMain, type IpcMainInvokeEvent } from "electron";

/**
 * `handle(channel, shape, fn)`: the ONE way this process accepts a renderer call.
 * ⚠️ A parameter's TypeScript annotation is compile-time fiction at this boundary (rule 7:
 * an XSS calls the channel with any value), so the shape is declared as VALUES and a
 * mismatch REJECTS before the body runs. The rejection names channel, index and expected
 * type, NEVER the value (it can be a provider key). A floor, not a schema language: the
 * capability gates decide what a well-formed call may touch. Pinned by `handle.test.ts`.
 */

export interface Check<T> {
  readonly name: string;
  readonly check: (v: unknown) => v is T;
}

const def = <T>(name: string, check: (v: unknown) => boolean): Check<T> => ({
  name,
  check: check as (v: unknown) => v is T,
});

export const str = def<string>("string", (v) => typeof v === "string");
export const num = def<number>("number", (v) => typeof v === "number" && Number.isFinite(v));
export const bool = def<boolean>("boolean", (v) => typeof v === "boolean");
/** A plain object — the structural payloads (a conversation, a settings blob). Rejects
 *  null and arrays, which is the point: `null.foo` and `[].id` are the crashes. */
export const obj = def<Record<string, unknown>>(
  "object",
  (v) => typeof v === "object" && v !== null && !Array.isArray(v),
);
export const arr = def<unknown[]>("array", Array.isArray);
/** Deliberately unconstrained — use ONLY where the handler itself validates, and say why. */
export const any = def<unknown>("any", () => true);

export const nullable = <T>(c: Check<T>): Check<T | null> =>
  def(`${c.name}|null`, (v) => v === null || c.check(v));
export const optional = <T>(c: Check<T>): Check<T | undefined> =>
  def(`${c.name}?`, (v) => v === undefined || c.check(v));
export const oneOf = <T>(...cs: Check<T>[]): Check<T> =>
  def(cs.map((c) => c.name).join("|"), (v) => cs.some((c) => c.check(v)));

type Values<A extends readonly Check<unknown>[]> = {
  [K in keyof A]: A[K] extends Check<infer T> ? T : never;
};

/** Thrown at the boundary. Carries no argument VALUE — only where and what was expected. */
export class IpcArgumentError extends Error {
  constructor(channel: string, index: number, expected: string, got: string) {
    super(`IPC ${channel}: argument ${index} must be ${expected} (got ${got})`);
    this.name = "IpcArgumentError";
  }
}

/** The type name of a value, for the message. Never its contents. */
function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function handle<const A extends readonly Check<unknown>[]>(
  channel: string,
  shape: A,
  fn: (event: IpcMainInvokeEvent, ...args: Values<A>) => unknown,
): void {
  ipcMain.handle(channel, (event, ...raw: unknown[]) => {
    for (let i = 0; i < shape.length; i++) {
      if (!shape[i].check(raw[i])) {
        // Refuse BEFORE the privileged body. Logged without the value.
        const err = new IpcArgumentError(channel, i, shape[i].name, typeName(raw[i]));
        console.warn(`[ipc] refused: ${err.message}`);
        throw err;
      }
    }
    // Extra arguments are dropped rather than forwarded.
    return fn(event, ...(raw.slice(0, shape.length) as Values<A>));
  });
}
