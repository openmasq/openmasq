// The terminal UI, in one home: colours, pills, the card, the footer, the keys.
export type { BannerData, KeyHint, ModelState } from "./banner.js";
export { keyHintLine, modelLabel, renderBanner } from "./banner.js";
export { attachKeys, copyToClipboard, handleKey, KEY_HINTS, type KeyActions } from "./keys.js";
export { HUE_HEX, INK_HEX, LIME_HEX } from "./palette.js";
export { categoryPill, categoryPills, categoryTag } from "./pills.js";
export {
  createReporter,
  type Dials,
  type Reporter,
  type ReporterOptions,
  type RequestEvent,
  revealLines,
  silentReporter,
  type Stats,
} from "./reporter.js";
export { createStatusBar, type StatusBar } from "./status.js";
export { colorsWanted, createTty, formatDuration, formatMs, type Tty } from "./tty.js";
