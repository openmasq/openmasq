import type { Detected, Item } from "./composerDetection";

/**
 * ONE chip per identity — including when a value is NESTED inside another.
 *
 * `buildDetection`'s dedup is value-keyed: « 12345678 » and « 12345678Z » are two distinct
 * keys, so on « DNI 12345678Z » the preview showed TWO chips where the send allocates only
 * ONE fake (measured on the HR run, 17/08: the engine returns 3 matches for 3 values, the
 * preview showed 4).
 *
 * ⚠️ This is not cosmetic. A chip is CLICKABLE to « garder en clair »: the bare-digits one
 * offered to un-redact half a national number. Same family as the reclassified Vault term
 * that carried two chips — it is the preview that lies, on the very surface whose whole
 * job is to be believed.
 *
 * The rule: keep the LONG span, never the fragment. A value is dropped only if EVERY one
 * of its occurrences is STRICTLY contained in an occurrence of another — two values that
 * partially overlap, or that also appear alone elsewhere in the draft, each keep their
 * own.
 */
export function dropNested(
  found: readonly { item: Item; mine: Detected[] }[],
): { item: Item; mine: Detected[] }[] {
  return found.filter(({ item, mine }) =>
    !mine.every((r) =>
      found.some(
        ({ item: autre, mine: siens }) =>
          autre.value !== item.value &&
          siens.some(
            (q) => q.start <= r.start && q.end >= r.end && q.end - q.start > r.end - r.start,
          ),
      ),
    ),
  );
}
