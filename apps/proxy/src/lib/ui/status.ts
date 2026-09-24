// The sticky footer: the dials, the running counts and the keys, repainted in place while the
// request lines scroll above it. `log-update` owns the last block written to the stream, so a
// log line has to clear it first and repaint after — that is all `log` does.
import spinners from "cli-spinners";
import { createLogUpdate } from "log-update";

export interface StatusBar {
  /** Print a line above the bar. */
  log(line: string): void;
  render(): void;
  /** Erase the bar and stop the clock (before a summary, or on quit). */
  stop(): void;
  /** A spinner while something loads; the returned function ends it. */
  spinner(text: string): () => void;
  readonly live: boolean;
}

const REPAINT_MS = 1000;

export function createStatusBar(
  stream: NodeJS.WriteStream,
  lines: () => string[],
  enabled: boolean,
): StatusBar {
  const write = (l: string) => stream.write(`${l}\n`);
  if (!enabled) {
    return {
      live: false,
      log: write,
      render() {},
      stop() {},
      spinner: () => () => {},
    };
  }
  const update = createLogUpdate(stream, { showCursor: false });
  let timer: NodeJS.Timeout | undefined;
  let spinning: NodeJS.Timeout | undefined;
  const render = () => {
    if (spinning) return; // a spinner owns the block until it ends
    update(lines().join("\n"));
  };
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    timer = setInterval(render, REPAINT_MS).unref();
    stream.on("resize", render);
  };
  return {
    live: true,
    log(line) {
      update.clear();
      write(line);
      render();
      start();
    },
    render() {
      render();
      start();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      started = false;
      stream.off("resize", render);
      update.clear();
      update.done();
    },
    spinner(text) {
      const { frames, interval } = spinners.dots;
      let i = 0;
      update.clear();
      spinning = setInterval(() => {
        update(`  ${frames[i++ % frames.length]} ${text}`);
      }, interval);
      return () => {
        if (spinning) clearInterval(spinning);
        spinning = undefined;
        update.clear();
      };
    },
  };
}
