import { describe, it, expect } from "vitest";
import { ALLOWED } from "./sanitize";
import type { EventName, TrackEvent } from "./events";

/**
 * PARITÉ vocabulaire ⇄ allow-list, au niveau TYPE — le trou que l'audit 13/08 a trouvé
 * déjà exploité deux fois : un champ déclaré dans `events.ts` mais absent d'`ALLOWED`
 * était retiré SANS UN MOT par le walk (`loopId` sur tool_loop_summary : la jointure du
 * funnel agentique cassée en silence). Un test d'exemples ne peut pas l'attraper ; le
 * compilateur, si. Les deux directions :
 *  - `_AucunManquant` : chaque clé d'un événement est dans sa ligne ALLOWED ;
 *  - `_AucunSurplus` : ALLOWED ne liste pas une clé qu'aucun événement ne porte.
 * Une dérive fait ÉCHOUER le typecheck (qui couvre les tests) en NOMMANT la clé.
 */
type KeysOf<N extends EventName> = Exclude<keyof Extract<TrackEvent, { name: N }>, "name">;

type Manquantes = { [N in EventName]: Exclude<KeysOf<N>, (typeof ALLOWED)[N][number]> }[EventName];
type Surplus = { [N in EventName]: Exclude<(typeof ALLOWED)[N][number], KeysOf<N>> }[EventName];

type Expect<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

// Si une clé manque/déborde, la ligne fautive est nommée dans l'erreur de compilation.
type _AucunManquant = Expect<IsNever<Manquantes>>;
type _AucunSurplus = Expect<IsNever<Surplus>>;

describe("parité vocabulaire ⇄ allow-list", () => {
  it("est portée par le TYPECHECK (les alias ci-dessus) — ce test n'est que l'ancrage", () => {
    // Ancrage runtime minimal : chaque événement du vocabulaire a une ligne (le
    // `satisfies` de sanitize.ts le garantit déjà ; ceci rend le fichier exécutable).
    expect(Object.keys(ALLOWED).length).toBeGreaterThan(30);
  });
});
