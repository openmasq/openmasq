/**
 * The drop-time masking runs, ONE AT A TIME, first in first out — above every screen.
 *
 * ⚠️ Two invariants:
 *  • ONE run at a time. The default engine has a single local detector worker; two files
 *    masked together interleave their chunks on it, both crawl, and each chip's estimate is
 *    wrong. The waiting file is told how many runs are ahead of it (`onQueued`) and its
 *    clock (deadline, estimate) starts when it RUNS.
 *  • A run is NOT the screen's: it outlives the chat view (a switch of conversation, a trip
 *    to Bibliothèque) and only a CANCEL stops it — the chip removed (`cancel`) or its
 *    conversation deleted (`cancelGroup`, from `dropScratch`). Re-queuing on a visit is what
 *    restarts a masking from 0 %: callers check `has` first.
 *
 * A second, IDLE lane (`enqueueIdle`) carries the work nobody waits on — the provisional
 * preview of a file still being READ (`pages/ChatWorkspace/readingPreview.ts`). It runs only
 * when no real run runs or waits, never alongside one (same single detector), and a real run
 * enqueued meanwhile PREEMPTS it: the idle job is aborted and re-queued at the head of its
 * lane, to run again from scratch once the real line is empty. An idle job never counts as
 * « ahead » of a real one.
 *
 * Jobs are OPAQUE (a key, a group, a `run`): this module never reads an attachment.
 * Pinned by `maskQueue.test.ts`, `redactAttachment.test.ts`, `ChatView/useAttachments.test.tsx`.
 */
interface QueuedJob {
  /** One job per key (the chip id): enqueuing the same key replaces the previous job. */
  key: string;
  /** Where the job's item is staged (the conversation id, `""` for the draft). */
  group: string;
  /** The work. MUST settle once `signal` aborts — the slot is released at once anyway. */
  run(signal: AbortSignal): Promise<void>;
  /** While waiting: how many jobs run or wait before this one (≥ 1). */
  onQueued?(ahead: number): void;
}

export interface JobQueue {
  enqueue(job: QueuedJob): void;
  /** Lowest priority: runs only when the real line is empty, preempted by any real job. Its
   *  `run` must tolerate being aborted and called again. */
  enqueueIdle(job: QueuedJob): void;
  /** Abort the running job or drop the waiting one with this key. */
  cancel(key: string): void;
  /** Cancel every job of a group (its conversation was deleted). */
  cancelGroup(group: string): void;
  /** Is a job with this key running or waiting? */
  has(key: string): boolean;
}

export function createJobQueue(): JobQueue {
  const waiting: QueuedJob[] = [];
  const idle: QueuedJob[] = [];
  let running: { job: QueuedJob; ctrl: AbortController; idle: boolean } | null = null;

  const announce = () => {
    const offset = running && !running.idle ? 1 : 0;
    waiting.forEach((j, i) => j.onQueued?.(i + offset));
  };

  /** A real job arrived: the idle one running steps aside, first in its lane again. */
  const preemptIdle = () => {
    if (!running?.idle) return;
    running.ctrl.abort();
    idle.unshift(running.job);
    running = null;
  };

  const pump = () => {
    if (running) return;
    const isIdle = !waiting.length;
    const job = isIdle ? idle.shift() : waiting.shift();
    if (!job) return;
    const slot = { job, ctrl: new AbortController(), idle: isIdle };
    running = slot;
    announce();
    let done: Promise<void>;
    try {
      done = job.run(slot.ctrl.signal);
    } catch (e) {
      done = Promise.reject(e);
    }
    // The job reports its own failures; a rejection here only frees the slot. The identity
    // check keeps a cancelled run, settling late, from freeing the NEXT job's slot.
    void done
      .catch(() => undefined)
      .finally(() => {
        if (running !== slot) return;
        running = null;
        pump();
      });
  };

  const cancel = (key: string) => {
    for (const line of [waiting, idle]) {
      const i = line.findIndex((j) => j.key === key);
      if (i >= 0) line.splice(i, 1);
    }
    if (running?.job.key === key) {
      running.ctrl.abort();
      running = null;
    }
    pump();
    announce();
  };

  return {
    enqueue(job) {
      cancel(job.key);
      waiting.push(job);
      preemptIdle();
      pump();
      announce();
    },
    enqueueIdle(job) {
      cancel(job.key);
      idle.push(job);
      pump();
    },
    cancel,
    cancelGroup(group) {
      const keys = [...waiting, ...idle, ...(running ? [running.job] : [])].filter((j) => j.group === group).map((j) => j.key);
      for (const k of keys) cancel(k);
    },
    has: (key) => running?.job.key === key || waiting.some((j) => j.key === key) || idle.some((j) => j.key === key),
  };
}

/** THE queue of the app's attachment masking (one detector worker, one run). */
export const maskQueue: JobQueue = createJobQueue();
