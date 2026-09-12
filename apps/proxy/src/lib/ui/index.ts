// The terminal UI, in one home: colours, pills, the card, the rows, the footer, the keys.
export type { BannerData, KeyHint, ModelState } from "./banner.js";
export { keyHintLine, modelLabel, renderBanner } from "./banner.js";
export { attachKeys, copyToClipboard, handleKey, KEY_HINTS, type KeyActions } from "./keys.js";
export { HUE_HEX, INK_HEX, LIME_HEX } from "./palette.js";
export { categoryPill, categoryPills, categoryTag } from "./pills.js";
export type { Dials, Stats } from "./footer.js";
export {
  createReporter,
  type Reporter,
  type ReporterOptions,
  revealFor,
  silentReporter,
} from "./reporter.js";
export { type RequestEvent, revealLines } from "./rows.js";
export { mastheadRows, printMasthead } from "./masthead.js";
export { openIfWanted } from "./splash.js";
export { createStatusBar, type StatusBar } from "./status.js";
export { colorsWanted, createTty, formatDuration, formatMs, type Tty } from "./tty.js";
