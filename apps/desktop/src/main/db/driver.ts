import { app, dialog } from "electron";
import type { createClient as CreateClient } from "@libsql/client";
import { reportMainError } from "../runtime/errorReport";
import { BRAND } from "@openmasq/branding";

/**
 * LAZY loading of the native libSQL driver, and the failure made legible.
 *
 * Why lazy: `@libsql/client` is `external`, so an `import` at the top of the module
 * is a native `require` executed when the main bundle LOADS — before `Sentry.init`,
 * before the error bridge, before a single line of our own. When Windows refuses this
 * `dlopen`, the user gets Electron's raw dialog ("A JavaScript error occurred
 * in the main process" + a stack), and WE get nothing: zero event, no
 * trace. This happened on the first real Windows install.
 *
 * Deferred until a database is opened (at connection time), the failure becomes catchable: we
 * REPORT it, and tell the user what's missing and how to fix it, instead of showing
 * them a call stack.
 */

/** A NATIVE MODULE load failure, as opposed to a database error.
 *  Node gives `ERR_DLOPEN_FAILED`; the message itself is translated by Windows ("The specified
 *  module could not be found"), so it can't serve as the sole test — the code
 *  is checked first, the message is only a safety net for runtimes that don't set it.
 *  Pure, hence tested (`driver.test.ts`). */
export function isNativeLoadFailure(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "ERR_DLOPEN_FAILED") return true;
  const msg = typeof e?.message === "string" ? e.message : "";
  return /dlopen|\.node\b/i.test(msg) && /not be found|introuvable|no such file|cannot open/i.test(msg);
}

/** What we tell the user. Windows is the only known case (the driver there depends on the
 *  "Visual C++ Redistributable", which our builds now bundle alongside the exe —
 *  a binary missing these DLLs is therefore either old or incomplete). */
function explain(): { title: string; message: string } {
  if (process.platform === "win32") {
    return {
      title: `${BRAND.name} ne peut pas démarrer`,
      message:
        "Un composant système requis par la base de données locale est absent de cet " +
        "ordinateur : le « Microsoft Visual C++ Redistributable » (x64).\n\n" +
        "Installez-le depuis https://aka.ms/vs/17/release/vc_redist.x64.exe, puis " +
        `relancez ${BRAND.name}.\n\n` +
        `Si le problème persiste, réinstallez ${BRAND.name} : cette version embarque normalement ` +
        "ce composant.",
    };
  }
  return {
    title: `${BRAND.name} ne peut pas démarrer`,
    message:
      "Le composant natif de la base de données locale n'a pas pu être chargé. " +
      `Réinstallez ${BRAND.name} pour réparer l'installation.`,
  };
}

let cached: typeof CreateClient | null = null;

/**
 * libSQL's `createClient`, loaded on the first database open.
 *
 * A NATIVE load failure is terminal: it will recur on every launch, and without
 * a database the app has no conversations, no vault, no keys. We REPORT it (Sentry + telemetry),
 * explain it, then quit — rather than leave an app running where every write
 * would be a silent no-op. Any other error propagates unchanged to the caller.
 */
export async function loadDriver(): Promise<typeof CreateClient> {
  if (cached) return cached;
  try {
    ({ createClient: cached } = await import("@libsql/client"));
    return cached;
  } catch (err) {
    if (!isNativeLoadFailure(err)) throw err;
    reportMainError("db", "native_load_failed", err);
    const { title, message } = explain();
    dialog.showErrorBox(title, message);
    app.quit();
    throw err;
  }
}
