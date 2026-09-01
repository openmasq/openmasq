import { describe, it, expect } from "vitest";
import { ALLOWED } from "./sanitize";
import type { EventName, TrackEvent } from "./events";

/**
 * PARITY vocabulary ⇄ allow-list, at the TYPE level — the hole the 13/08 audit found
 * already exploited twice: a field declared in `events.ts` but absent from `ALLOWED`
 * was dropped WITHOUT A WORD by the walk (`loopId` on tool_loop_summary: the agentic
 * funnel's join broken in silence). A test of examples cannot catch that; the compiler
 * can. Both directions:
 *  - `_AucunManquant`: every key of an event is in its ALLOWED row;
 *  - `_AucunSurplus`: ALLOWED does not list a key that no event carries.
 * A drift FAILS the typecheck (which covers the tests) by NAMING the key.
 */
type KeysOf<N extends EventName> = Exclude<keyof Extract<TrackEvent, { name: N }>, "name">;

type Manquantes = { [N in EventName]: Exclude<KeysOf<N>, (typeof ALLOWED)[N][number]> }[EventName];
type Surplus = { [N in EventName]: Exclude<(typeof ALLOWED)[N][number], KeysOf<N>> }[EventName];

type Expect<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

// If a key is missing/extra, the offending row is named in the compilation error.
type _AucunManquant = Expect<IsNever<Manquantes>>;
type _AucunSurplus = Expect<IsNever<Surplus>>;

describe("parité vocabulaire ⇄ allow-list", () => {
  it("est portée par le TYPECHECK (les alias ci-dessus) — ce test n'est que l'ancrage", () => {
    // Minimal runtime anchor: every event of the vocabulary has a row (sanitize.ts's
    // `satisfies` already guarantees it; this makes the file executable).
    expect(Object.keys(ALLOWED).length).toBeGreaterThan(30);
  });
});
