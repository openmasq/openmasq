import { useSyncExternalStore } from "react";

/**
 * Which conversations have a staged file still being READ or MASKED — and a signal each
 * time a conversation's staging is written.
 *
 * The staging itself (`stagedFiles.ts`) sits in refs and renders nothing; work that
 * finishes while the user is elsewhere must still reach (a) the chat view showing that
 * conversation, which re-reads its staging on the signal, and (b) the sidebar row and the
 * tab, which wear a « en préparation » mark from `useStagedBusy`. The writer computes
 * `busy` (it knows the item shape; this module, like `stagedFiles.ts`, does not).
 */
type Listener = (group: string) => void;

const busy = new Set<string>();
const listeners = new Set<Listener>();
let version = 0;

/** A conversation's staging was written; `isBusy` = some file still read or masked. */
export function publishStaged(group: string, isBusy: boolean): void {
  if (isBusy !== busy.has(group)) {
    if (isBusy) busy.add(group);
    else busy.delete(group);
    version++;
  }
  for (const l of [...listeners]) l(group);
}

/** The conversation is gone: no mark, and anyone showing it re-reads (now empty). */
export function forgetStaged(group: string): void {
  publishStaged(group, false);
}

export function subscribeStaged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStagedBusy(group: string): boolean {
  return busy.has(group);
}

const subscribeVersion = (fn: () => void) => subscribeStaged(() => fn());
const readVersion = () => version;

/** Re-renders when ANY conversation starts or stops being busy (not on every progress tick). */
export function useStagedBusyVersion(): number {
  return useSyncExternalStore(subscribeVersion, readVersion, readVersion);
}

/** Is this conversation's staging being read or masked? */
export function useStagedBusy(group: string | undefined): boolean {
  const read = () => group !== undefined && busy.has(group);
  return useSyncExternalStore(subscribeVersion, read, read);
}
