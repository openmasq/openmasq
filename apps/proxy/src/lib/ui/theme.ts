// Which ground the terminal paints on, and how many colours it can actually show. Both are
// GUESSES a terminal only half publishes, so both fail towards the safe answer: the theme
// falls back to dark (what most terminals are, and what the previous look silently assumed),
// the depth to 256 (every colour terminal has it; a 24-bit escape on a terminal without it
// prints garbage or a wrong hue).
import { THEME_HEX, type ThemeHex, type ThemeName } from "./palette.js";

export type { ThemeName };
/** What a flag may ask for: a ground, or "let the terminal say". */
export type ThemeChoice = ThemeName | "auto";
/** 24-bit truecolor, or the 256-colour cube. Below that, colours are off entirely. */
export type Depth = 24 | 8;

/** `--theme` first, then `OPENMASQ_PROXY_THEME`, then what the terminal says. */
export function resolveTheme(
  want: ThemeChoice = "auto",
  env: NodeJS.ProcessEnv = process.env,
): ThemeName {
  if (want !== "auto") return want;
  const fromEnv = env.OPENMASQ_PROXY_THEME;
  if (fromEnv === "light" || fromEnv === "dark") return fromEnv;
  return fromColorFgBg(env.COLORFGBG) ?? "dark";
}

/** `COLORFGBG` is `fg;bg` (or `fg;default;bg`) in ANSI indices — the one background hint a
 *  terminal publishes. 0-6 and 8 are the dark half of the 16-colour set. */
function fromColorFgBg(v: string | undefined): ThemeName | undefined {
  const last = (v ?? "").split(";").pop();
  if (!last || !/^\d+$/.test(last)) return undefined;
  const bg = Number(last);
  if (bg > 15) return undefined;
  return bg === 7 || bg > 8 ? "light" : "dark";
}

export function themeHex(name: ThemeName): ThemeHex {
  return THEME_HEX[name];
}

/**
 * What the terminal can render. `COLORTERM` is the only reliable truecolor signal; a
 * `TERM` ending in `-direct` is the terminfo way of saying the same thing. Everything else
 * gets the 256-colour cube — including `TERM=xterm-256color` alone, which is what
 * Terminal.app reports while quantising a 24-bit escape to something else entirely.
 */
export function colorDepth(env: NodeJS.ProcessEnv = process.env): Depth {
  const ct = (env.COLORTERM ?? "").toLowerCase();
  if (ct === "truecolor" || ct === "24bit") return 24;
  if (env.FORCE_COLOR === "3") return 24;
  if (/-direct\b/.test(env.TERM ?? "")) return 24;
  return 8;
}
