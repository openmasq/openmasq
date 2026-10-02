/**
 * The EN « runtime » slice — translated from the source (`../fr/runtime.ts`). Two halves (`runtimeTools`, `runtimeSend`)
 * to hold the 300-LOC cap; this file assembles them.
 */
import type { Messages } from "../messages";
import { runtimeLoop, runtimeTools } from "./runtimeTools";
import { runtimeFiles, runtimeMisc, runtimeSend } from "./runtimeSend";

export const runtime = {
  tools: runtimeTools,
  loop: runtimeLoop,
  send: runtimeSend,
  files: runtimeFiles,
  misc: runtimeMisc,
} satisfies Messages["runtime"];
