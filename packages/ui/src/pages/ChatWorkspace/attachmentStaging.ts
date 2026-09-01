import type { Attachment } from "./Composer";

/**
 * Where a chip lives: in local state, or parked in the store under the id of a
 * conversation not yet on screen.
 *
 * ⚠️ **Setting and fixing must pick the SAME side.** « Demander » creates the
 * conversation and stages the file in the same breath, and that conversation
 * only reaches the screen a commit later: a parked chip that gets fixed locally
 * is found nowhere, and stays « extraction en cours » forever. Two functions,
 * one single routing rule — that's the whole point of writing them together.
 */
export interface StagingDeps {
  /** The conversation ACTUALLY rendered right now (a ref, never a captured value). */
  currentConvId(): string | undefined;
  setLocal(update: (prev: Attachment[]) => Attachment[]): void;
  getParked?(convId: string): readonly Attachment[] | undefined;
  setParked?(convId: string, files: Attachment[]): void;
}

/**
 * Are TWO attachments the SAME ONE?
 *
 * ⚠️ Measured on 15/08/2026: « Demander » acts on the panel's ACTIVE tab, and pressed a
 * second time without changing tabs — which happens as soon as you think you've switched
 * files — it attached the SAME document a second time, without a word. The content went out
 * twice (tokens paid twice) and the model could read it as TWO documents to
 * compare: it started a "document 1 / document 2" reply on a duplicate.
 *
 * ⚠️ And identity MOVES while loading: « Demander » first sets an EMPTY chip
 * (name only), which extraction then fills in. A frozen "name + text length" key
 * therefore didn't recognize the chip already set, and the duplicate slipped through — verified
 * live, that's what made the first version of this fix fail.
 *
 * Hence the comparison, in this order: the PATH when both have one; otherwise the NAME,
 * with sizes only breaking the tie when BOTH are already filled in (two same-named files
 * with different content stay two attachments).
 */
const sameAttachment = (a: Attachment, b: Attachment): boolean => {
  if (a.path && b.path) return a.path === b.path;
  if (a.name !== b.name) return false;
  const ta = a.text?.length ?? 0;
  const tb = b.text?.length ?? 0;
  return !ta || !tb || ta === tb;
};

export function makeStaging(d: StagingDeps): {
  stage(added: Attachment[], forConvId?: string): void;
  patch(cid: string, patch: Partial<Attachment>, forConvId?: string): void;
} {
  // Setting a file meant for an OTHER conversation onto local state would show it on
  // the one the user is leaving — hence the routing, rather than a plain `setLocal`.
  const parked = (forConvId?: string): string | undefined =>
    forConvId && forConvId !== d.currentConvId() ? forConvId : undefined;

  return {
    stage(added, forConvId) {
      // A file ALREADY attached to this conversation doesn't get re-attached (see `identity`).
      const neufs = (deja: readonly Attachment[]): Attachment[] => {
        const vus: Attachment[] = [...deja];
        return added.filter((a) => {
          if (vus.some((b) => sameAttachment(a, b))) return false;
          vus.push(a); // the batch itself can carry the same file twice
          return true;
        });
      };
      const id = parked(forConvId);
      if (id) {
        const deja = d.getParked?.(id) ?? [];
        const ajout = neufs(deja);
        if (ajout.length) d.setParked?.(id, [...deja, ...ajout]);
      } else {
        d.setLocal((prev) => [...prev, ...neufs(prev)]);
      }
    },
    patch(cid, patch, forConvId) {
      const apply = (list: readonly Attachment[]): Attachment[] =>
        list.map((a) => (a.cid === cid ? { ...a, ...patch } : a));
      const id = parked(forConvId);
      if (id) d.setParked?.(id, apply(d.getParked?.(id) ?? []));
      else d.setLocal(apply);
    },
  };
}
