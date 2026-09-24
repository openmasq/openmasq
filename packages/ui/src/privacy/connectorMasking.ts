import type { ConnectorMasking } from "@openmasq/catalog";
import type { PrivacyLevel } from "./privacyLevel";

/** A connector's OWN level, or `null` when it follows the global one — which is what the
 *  pickers call "Default" and what nearly every connector keeps. Named because the three
 *  surfaces that pass it around were each spelling the exclusion out. */
export type ConnectorLevel = Exclude<PrivacyLevel, "custom"> | null;

/**
 * Setting — or CLEARING — one connector's own masking level, on the settings map.
 *
 * Its own function because the clearing half is where this goes wrong. "Default" is the
 * ABSENCE of an override, so picking it must leave no trace: a `{ level: undefined }` still
 * makes the connector an entry, `overridesMasking` then reads it as differing from the
 * global rules, and the pipeline hands it a masker of its own that masks exactly like the
 * shared one — two identical maskers, which mint two identities for one value.
 *
 * So an entry emptied of everything is REMOVED, and a map emptied of every entry becomes
 * `undefined` rather than `{}`: what is persisted then says what is true, and a settings
 * blob does not accumulate the shape of choices the user took back.
 *
 * ⚠️ `disable` and `keep` are carried through untouched. This surface offers the level and
 * nothing else, and silently dropping the other two would let a picker undo a policy it
 * never showed.
 */
export function withConnectorLevel(
  current: Record<string, ConnectorMasking> | undefined,
  connectorId: string,
  level: ConnectorLevel,
): Record<string, ConnectorMasking> | undefined {
  const next = { ...(current ?? {}) };
  const rest = { ...next[connectorId] };
  if (level) rest.level = level;
  else delete rest.level;

  if (Object.keys(rest).length === 0) delete next[connectorId];
  else next[connectorId] = rest;

  return Object.keys(next).length === 0 ? undefined : next;
}
