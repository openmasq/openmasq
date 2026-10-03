import type { NerPredict } from "@openmasq/redact/ner";

/**
 * The worker's book of runs the client CANCELLED (a superseded preview). Inference awaits
 * onnxruntime per chunk, so a cancel message is read between two chunks and the run's NEXT
 * chunk throws — the rest of a long document is skipped and the run reports a failure,
 * never a partial result. Only an ACTIVE run can be marked, so a late cancel leaves nothing.
 */
export function cancelRuns() {
  const active = new Set<number>();
  const cancelled = new Set<number>();
  return {
    start: (id: number) => void active.add(id),
    cancel: (id: number) => {
      if (active.has(id)) cancelled.add(id);
    },
    end: (id: number) => {
      active.delete(id);
      cancelled.delete(id);
    },
    /** `predict`, refusing every chunk once run `id` is cancelled. */
    guard: (id: number, predict: NerPredict): NerPredict => (chunk) => {
      if (cancelled.has(id)) throw new Error("détection locale annulée");
      return predict(chunk);
    },
    size: () => active.size + cancelled.size,
  };
}
