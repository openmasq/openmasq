/**
 * The extraction FIFO. OCR is CPU-bound and one document already spreads over the cores
 * (onnxruntime's intra-op threads): ten scans run at once do not finish sooner, they all
 * finish LATE together — with ten pages rasterised in memory and every per-file timeout
 * burning while the file waits for CPU. One at a time, the first file is ready first and
 * the user can open it while the rest wait their turn.
 *
 * A waiting job is told how many files are ahead of it (`onWaiting`), again each time
 * the line moves, so its chip can say so. A job's own clock (the worker timeout) starts
 * when the job STARTS — the queue only decides when that is.
 *
 * CANCEL (`signal`): the user removed the file. A WAITING job leaves the line at once (the
 * files behind it are re-told their place); a RUNNING job gets the same signal and stops its
 * own work — its caller is answered at once, its SLOT frees only when the work really
 * settles, so a job that cannot be interrupted never runs beside the next one.
 */

/** The rejection of a cancelled job — never shown: the file it was for is gone. */
export class ExtractCancelled extends Error {
  constructor() {
    super("extraction annulée");
    this.name = "ExtractCancelled";
  }
}

interface Waiting {
  start: () => void;
  onWaiting?: (ahead: number) => void;
}

export interface ExtractQueue {
  run<T>(job: (signal?: AbortSignal) => Promise<T>, onWaiting?: (ahead: number) => void, signal?: AbortSignal): Promise<T>;
}

export function createExtractQueue(concurrency = 1): ExtractQueue {
  let active = 0;
  const line: Waiting[] = [];

  const tell = () => line.forEach((w, i) => w.onWaiting?.(active + i));

  const next = () => {
    if (active >= concurrency) return;
    const w = line.shift();
    if (!w) return;
    active++;
    w.start();
    tell();
  };

  return {
    run<T>(job: (signal?: AbortSignal) => Promise<T>, onWaiting?: (ahead: number) => void, signal?: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) return reject(new ExtractCancelled());
        const start = () => {
          let settled: Promise<T>;
          try {
            settled = job(signal);
          } catch (e) {
            settled = Promise.reject(e);
          }
          settled.then(resolve, reject).finally(() => {
            active--;
            next();
          });
        };
        const entry: Waiting = { start, onWaiting };
        signal?.addEventListener(
          "abort",
          () => {
            const at = line.indexOf(entry);
            if (at >= 0) {
              line.splice(at, 1);
              tell();
            }
            reject(new ExtractCancelled()); // a running job: answered now, its slot frees on settle
          },
          { once: true },
        );
        if (active < concurrency && line.length === 0) {
          active++;
          start();
          return;
        }
        line.push(entry);
        onWaiting?.(active + line.length - 1);
      });
    },
  };
}
