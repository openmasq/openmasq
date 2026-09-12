// The runtime dials the keys turn (`ui/keys.ts`), bound to the running proxy's state. Every
// dial keeps the proxy masking: a level change is the app's own level arithmetic, and a level
// that needs the on-device model is REFUSED, not applied, when the model cannot be loaded.
import type { RedactionLevel } from "@openmasq/catalog";
import { LEVELS, type ProxyConfig } from "../config/config.js";
import { envLines } from "./baseUrls.js";
import { disabledKindsFor, levelNeedsModel, type MaskerOptions } from "./masker.js";
import type { KeyActions } from "./ui/keys.js";

export interface DialDeps {
  config: ProxyConfig;
  /** Read by the masker at request time — re-pointed here, never rebuilt. */
  maskerOpts: MaskerOptions;
  reveal: { on: boolean };
  url: string;
  hasModel: () => boolean;
  /** Load the model once; "" on success, or why it cannot run. */
  ensureModel: () => Promise<string>;
  quit: () => void;
}

export function createDials(d: DialDeps): KeyActions {
  return {
    cycleLevel: async () => {
      const { config } = d;
      const next = LEVELS[(LEVELS.indexOf(config.level) + 1) % LEVELS.length] as RedactionLevel;
      if (levelNeedsModel(next, config.disabledKinds) && !d.hasModel()) {
        const why = await d.ensureModel();
        if (why)
          return { level: config.level, refused: `${next} needs the on-device model: ${why}` };
      }
      config.level = next;
      d.maskerOpts.level = next;
      d.maskerOpts.disabledKinds = disabledKindsFor(next, config.disabledKinds);
      return { level: next };
    },
    toggleMode: () => {
      d.config.mode = d.config.mode === "fake" ? "token" : "fake";
      return d.config.mode;
    },
    toggleReveal: () => {
      d.reveal.on = !d.reveal.on;
      return d.reveal.on;
    },
    envLines: () => envLines(d.url),
    quit: d.quit,
  };
}
