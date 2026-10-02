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
 */

interface Waiting {
  start: () => void;
  onWaiting?: (ahead: number) => void;
}

export interface ExtractQueue {
  run<T>(job: () => Promise<T>, onWaiting?: (ahead: number) => void): Promise<T>;
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
    run<T>(job: () => Promise<T>, onWaiting?: (ahead: number) => void): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          let settled: Promise<T>;
          try {
            settled = job();
          } catch (e) {
            settled = Promise.reject(e);
          }
          settled.then(resolve, reject).finally(() => {
            active--;
            next();
          });
        };
        if (active < concurrency && line.length === 0) {
          active++;
          start();
          return;
        }
        line.push({ start, onWaiting });
        onWaiting?.(active + line.length - 1);
      });
    },
  };
}
