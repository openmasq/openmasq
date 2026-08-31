import { app } from "electron";

/**
 * "The app is quitting" — the state every child-process death reporter
 * must consult: shutdown KILLS the workers (NER, embed, fs, broker), and without
 * this gate every quit would produce four false crash reports. ONE home (rule 9);
 * the listener installs at import, before any fork.
 */
let quitting = false;
app.on("before-quit", () => {
  quitting = true;
});

export const isAppQuitting = (): boolean => quitting;
