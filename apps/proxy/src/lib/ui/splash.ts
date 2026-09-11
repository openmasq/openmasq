// The opening sequence: a second and a half, the whole terminal, then the terminal back as it
// was. It exists because of an invariant, not for decoration: a wrapped tool OWNS the screen
// (`CLAUDE.md`), so the card is painted over the moment the tool starts and the operator never
// sees what they just started. This runs BEFORE that, on the ALTERNATE screen — which the
// terminal restores on exit, so nothing of the user's scrollback is spent.
//
// What it shows is the app's own loader: the redaction mark travelling a ring (`ring.ts`,
// the walk imported from the engine) around the name, which writes itself inside it. Then the
// ring closes and the proxy starts. Nothing else — an opening that filled the screen with
// colour was tried and removed: nine hues MEAN nine categories, and a field of them means
// nothing at all.
import type { ProxyConfig } from "../../config/config.js";
import { disabledKindsFor } from "../masker.js";
import { inClearPhrase } from "./kinds.js";
import { HUE_HEX } from "./palette.js";
import { CELL_W, CELL_W_NARROW, cell, ringAt, ringHues, ringPath, seeded } from "./ring.js";
import { colorsWanted, createTty, SCREEN, type Tty } from "./tty.js";
import { WORDMARK_COLS, WORDMARK_ROWS, wordmarkCells } from "./wordmark.js";

/** What this run actually masks. `disabled` is the level arithmetic's own answer
 *  (`disabledKindsFor`), so the sequence can never claim more than the masker does. */
export interface SplashView {
  level: string;
  disabled: readonly string[];
}

/** Cells of padding between the ring and what it encloses. */
const PAD_X = 2;
const PAD_Y = 2;
/** The name is written while the ring runs; the claim follows; the ring closes last. */
const WRITE_FROM = 0.1;
const WRITE_TO = 0.62;
const CLAIM_AT = 0.66;
const CLOSE_FROM = 0.86;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - (1 - x) ** 3;
const at = (t: number, from: number, to: number) => ease(clamp((t - from) / (to - from)));

/**
 * The frame at `t` in [0, 1]. Pure: the player only adds the timing, and the tests read the
 * frames rather than the clock.
 */
export function splashFrame(
  tty: Tty,
  t: number,
  rows = 24,
  view: SplashView = { level: "strict", disabled: [] },
  seed = 7,
): string[] {
  const size = sizeFor(tty, rows);
  const cw = size.cellW;
  const inner = size.drawn ? { cols: WORDMARK_COLS, rows: WORDMARK_ROWS } : { cols: 12, rows: 1 };
  const box = { cols: inner.cols + PAD_X * 2, rows: inner.rows + PAD_Y * 2 };
  const path = ringPath(box).length;
  // The ring runs, then CLOSES: the trail grows to the whole border, so the last frame is the
  // name enclosed rather than a mark caught mid-lap.
  const trail = Math.min(path, Math.round(path * (0.3 + 0.7 * at(t, CLOSE_FROM, 1))));
  const lit = ringHues(box, ringAt(path, trail, trail + Math.floor(t * path), seeded(seed)));
  const letters = size.drawn ? wordmarkCells(at(t, WRITE_FROM, WRITE_TO)) : undefined;

  const drawn = Array.from({ length: box.rows }, (_, row) =>
    Array.from({ length: box.cols }, (_, col) => {
      const onRing = row === 0 || row === box.rows - 1 || col === 0 || col === box.cols - 1;
      if (onRing) return cell(tty, lit.get(`${col},${row}`), cw);
      if (letters?.has(`${col - PAD_X},${row - PAD_Y}`)) return cell(tty, tty.theme.brand, cw);
      return cell(tty, undefined, cw);
    }).join(""),
  );
  if (!letters) drawn[Math.floor(box.rows / 2)] = word(tty, box.cols * cw);

  // The box is centred on its own width; the two lines under it are centred on the SCREEN and
  // get its whole width — a claim clipped to the box would be a sentence about where personal
  // data goes, cut in half.
  const margin = " ".repeat(Math.max(0, Math.floor((tty.columns - box.cols * cw) / 2)));
  const said = t >= CLAIM_AT ? claim(tty, view, Math.max(20, tty.columns - 4)) : [];
  const lines = [
    ...drawn.map((l) => margin + l),
    "",
    ...said.map((l) => centre(tty, l, tty.columns)),
  ];
  const top = Math.max(0, Math.floor((rows - lines.length) / 2));
  return [...Array(top).fill(""), ...lines].slice(0, rows).map((l) => (l ? tty.fit(l, tty.columns) : ""));
}

/**
 * How big the composition can be here. Two columns a cell where there is room, one where there
 * is not — and only when even that will not fit, or the terminal is too short for the ring and
 * the two lines under it, is the name written out instead of drawn.
 */
function sizeFor(tty: Tty, rows: number): { drawn: boolean; cellW: number } {
  const tall = rows >= WORDMARK_ROWS + PAD_Y * 2 + 3;
  const boxCols = WORDMARK_COLS + PAD_X * 2;
  if (tall && tty.columns >= boxCols * CELL_W + 2) return { drawn: true, cellW: CELL_W };
  if (tall && tty.columns >= boxCols * CELL_W_NARROW + 2)
    return { drawn: true, cellW: CELL_W_NARROW };
  return { drawn: false, cellW: CELL_W };
}

/** The narrow fallback: the word itself, centred in the ring. A terminal too small for the
 *  letters gets the name, not three of them. */
function word(tty: Tty, width: number): string {
  const text = tty.bold("OpenMasq");
  const pad = Math.max(0, Math.floor((width - tty.width(tty.strip(text))) / 2));
  return " ".repeat(pad) + text;
}

/**
 * What this run does, in two lines, under the name.
 *
 * ⚠️ The second one is the sequence's only claim, and the only thing here that can be WRONG.
 * At `standard` — the default — names and companies are never looked for; an opening that let
 * the reader believe otherwise would be the overstatement rule 8 forbids. So the kinds come
 * from `disabledKindsFor`, they are NAMED, and when the line cannot hold them all it counts
 * the rest instead of quietly dropping them.
 */
function claim(tty: Tty, view: SplashView, width: number): string[] {
  const head = tty.dim(`masking this session  ·  level ${view.level}`);
  const left = inClearPhrase(view.disabled, width - "left in clear: ".length);
  if (!left) return [head, tty.dim("every value the engine finds is replaced")];
  return [head, tty.fg(HUE_HEX.amber, `left in clear: ${left}`)];
}

const centre = (tty: Tty, s: string, width: number) =>
  " ".repeat(Math.max(0, Math.floor((width - tty.width(tty.strip(s))) / 2))) + s;

/** Whether to play at all. Everything that is not an operator watching a terminal — a pipe, a
 *  machine log, a CI job, `--quiet`, `NO_COLOR` — gets straight to work instead. */
export function splashWanted(o: {
  enabled: boolean;
  colors: boolean;
  isTTY: boolean;
  json: boolean;
  quiet: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = o.env ?? process.env;
  return o.enabled && o.colors && o.isTTY && !o.json && !o.quiet && !env.CI;
}

/**
 * The one call `server.ts` makes: decide, build the terminal it needs, play. Nothing happens
 * unless an operator is watching (`splashWanted`).
 */
export async function openIfWanted(
  config: Pick<ProxyConfig, "splash" | "theme" | "json" | "verbose" | "level" | "disabledKinds">,
  out: NodeJS.WriteStream = process.stderr,
  stdin: NodeJS.ReadStream = process.stdin,
): Promise<void> {
  const tty = createTty(colorsWanted(), () => out.columns || 80, { theme: config.theme });
  const wanted = splashWanted({
    enabled: config.splash,
    colors: tty.colors,
    isTTY: !!out.isTTY,
    json: config.json,
    quiet: !config.verbose,
  });
  if (!wanted) return;
  // The claim can only say what the masker will actually do: the level arithmetic answers, not
  // this file.
  const view: SplashView = {
    level: config.level,
    disabled: disabledKindsFor(config.level, config.disabledKinds),
  };
  await playSplash(tty, out, { view, stdin });
}

interface SplashOptions {
  view?: SplashView;
  frames?: number;
  frameMs?: number;
  /** Any key ends it early. Off a TTY there is no key to press. */
  stdin?: NodeJS.ReadStream;
}

/**
 * Play it, then give the screen back. The alternate screen is entered and left in a `finally`:
 * an exception mid-sequence must not leave a terminal with no cursor.
 */
async function playSplash(tty: Tty, out: NodeJS.WriteStream, o: SplashOptions = {}): Promise<void> {
  const frames = o.frames ?? 26;
  const frameMs = o.frameMs ?? 58;
  const rows = out.rows || 24;
  const seed = Date.now() & 0xffff;
  const stdin = o.stdin ?? process.stdin;
  let stop = () => {};
  const skipped = new Promise<void>((resolve) => {
    if (!stdin?.isTTY) return;
    const onKey = () => resolve();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", onKey);
    stop = () => {
      stdin.off("data", onKey);
      stdin.setRawMode(false);
      stdin.pause();
    };
  });
  out.write(SCREEN.altOn + SCREEN.hideCursor);
  try {
    for (let i = 0; i <= frames; i++) {
      out.write(SCREEN.clear + splashFrame(tty, i / frames, rows, o.view, seed).join("\n"));
      const raced = await Promise.race([wait(frameMs), skipped.then(() => "skip" as const)]);
      if (raced === "skip") break;
    }
  } finally {
    stop();
    out.write(SCREEN.altOff + SCREEN.showCursor);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
