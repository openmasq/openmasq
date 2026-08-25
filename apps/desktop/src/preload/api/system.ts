import { ipcRenderer, type IpcRendererEvent } from "electron";
import type { DynamicModel } from "@openmasq/llm";
import type { LinkPreviewData } from "@openmasq/ui";
import type {
  AppVersions,
  UpdateStatus,
  UpdatesCurrent,
  UpdatesReleaseList,
  AllDesktopReleases,
} from "../types";

/** Microphone access. The renderer calls `ensureMicAccess()` before recording
 *  so macOS shows/refreshes its OS-level (TCC) mic prompt — a granted Chromium
 *  permission alone still fails under the hardened runtime. */
export const media = {
  ensureMicAccess: (): Promise<boolean> => ipcRenderer.invoke("media:ensure-mic"),
};

/**
 * Notification SYSTÈME quand une réponse arrive hors du champ de vision. Main la poste
 * (le renderer n'a pas de fenêtre à focaliser) ; au clic il montre et focalise la fenêtre
 * PUIS renvoie l'id du fil ici, pour que l'app l'ouvre.
 *
 * ⚠️ Rien du contenu ne transite : `title`/`body` sont composés côté renderer sans texte
 * de conversation (`state/replyNotice.ts`) et l'id ne s'affiche jamais.
 */
export const notify = {
  supported: (): Promise<boolean> => ipcRenderer.invoke("notify:supported"),
  reply: (input: { conversationId: string; title: string; body: string }): void => {
    void ipcRenderer.invoke("notify:reply", input);
  },
  onActivate: (cb: (conversationId: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, id: string): void => cb(id);
    ipcRenderer.on("notify:activate", handler);
    return () => ipcRenderer.removeListener("notify:activate", handler);
  },
};

/** Les compétences Claude Code de cette machine. Le renderer ne passe AUCUN chemin :
 *  main énumère ses propres racines et ne lit que des `SKILL.md`. */
export const claudeSkills = {
  list: (): Promise<{ folder: string; text: string; siblings: string[]; from: "home" | "project" }[]> =>
    ipcRenderer.invoke("claude-skills:list"),
};

/** OpenGraph link-unfurl (opt-in). Main fetches the page + og:image safely and
 *  returns a card with the image already inlined as a `data:` URL. */
export const links = {
  preview: (url: string): Promise<LinkPreviewData | null> =>
    ipcRenderer.invoke("links:preview", url),
  // Push the renderer's `linkPreviews` opt-in to main, which tracks it as the
  // AUTHORITATIVE flag (default OFF, fail-closed — audit M4). `links:preview` is
  // refused in main until this turns it on, so a renderer XSS can't unfurl links.
  setEnabled: (on: boolean): Promise<void> =>
    ipcRenderer.invoke("links:set-enabled", on),
};

/** Sandboxed Python execution. Main ensures the runtime (download-on-first-use)
 *  and runs the code jailed; returns stdout/stderr + any matplotlib PNGs (base64).
 *  `onProgress` streams a live status over `python:progress` for the call duration.
 *  `files` = deliverables generated earlier in the conversation, seeded into the
 *  run's working dir (main re-sanitizes them) so the code can load + modify them. */
export const python = {
  run: (
    code: string,
    onProgress?: (status: string) => void,
    files?: { name: string; base64: string }[],
  ): Promise<{ ok: boolean; stdout: string; stderr: string; images: { name: string; base64: string }[]; files: { name: string; base64: string; mime: string }[] }> => {
    const listener = (_e: IpcRendererEvent, status: string): void => onProgress?.(status);
    if (onProgress) ipcRenderer.on("python:progress", listener);
    return ipcRenderer
      .invoke("python:run", { code, files })
      .finally(() => {
        if (onProgress) ipcRenderer.removeListener("python:progress", listener);
      });
  },
};

/** Typeset a model-authored document (HTML + print CSS) to PDF bytes. Main renders it
 *  in an isolated, script-less, network-less window — nothing leaves the machine and
 *  nothing touches the disk (see `main/pdf/CLAUDE.md`). Rejects on any failure, so the
 *  caller falls back to the in-renderer pdf-lib exporter. */
export const pdf = {
  renderHtml: (req: { html: string; css: string; title: string }): Promise<Uint8Array> =>
    ipcRenderer.invoke("pdf:render-html", req),
};

/** Batch web reader: fetch several URLs' text IN PARALLEL over main's hardened
 *  `safeFetch` (SSRF-guarded, no cookies, no JavaScript). Returns one row per URL.
 *  The renderer passes already-un-redacted (real) URLs; main never sees the vault. */
export const web = {
  fetchMany: (
    urls: string[],
  ): Promise<{ url: string; ok: boolean; finalUrl?: string; text?: string; error?: string }[]> =>
    ipcRenderer.invoke("web:fetch-many", urls),
};

/** Live model catalogue (OpenRouter). Main fetches its public `/api/v1/models`
 *  endpoint and returns the normalized list; on any failure it resolves `[]`. */
export const models = {
  listOpenRouter: (): Promise<DynamicModel[]> => ipcRenderer.invoke("models:list-openrouter"),
};

/** Account auth bridge: receive the `<protocol>://auth/callback` magic-link deep
 *  link forwarded by the main process. The renderer (auth.ts) exchanges the
 *  PKCE code in the URL for a Supabase session. */
export const auth = {
  /** Subscribe to magic-link callback URLs. Signals readiness so the main
   *  process flushes any link that arrived before the renderer mounted.
   *  Returns an unsubscribe function. */
  onCallback: (cb: (url: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on("auth:callback", handler);
    ipcRenderer.send("auth:ready");
    return () => ipcRenderer.removeListener("auth:callback", handler);
  },
};

/** Billing bridge: receive the `<protocol>://billing/callback` deep link the web
 *  `/billing/return` page bounces after Stripe Checkout, so the app refocuses
 *  and refreshes the subscription. Returns an unsubscribe. */
export const billing = {
  onCallback: (cb: (url: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on("billing:callback", handler);
    // Reuse the shared readiness gate so a link buffered at boot flushes.
    ipcRenderer.send("auth:ready");
    return () => ipcRenderer.removeListener("billing:callback", handler);
  },
};

/** Subscribe to main-process errors, forwarded for the renderer's anonymised
 *  error-tracking channel (`captureError`). Returns an unsubscribe fn. */
export const onAppError = (
  cb: (e: { scope: string; code: string; name?: string; status?: number; message?: string }) => void,
): (() => void) => {
  const handler = (
    _e: IpcRendererEvent,
    payload: { scope: string; code: string; name?: string; status?: number; message?: string },
  ) => cb(payload);
  ipcRenderer.on("app:error", handler);
  return () => ipcRenderer.removeListener("app:error", handler);
};

/** Subscribe to main-process ANALYTICS events (the auto-update funnel), forwarded for
 *  the renderer's consent-gated, allow-listed `captureEvent`. Loosely typed at the wire
 *  (like `onAppError`); the renderer casts it back to the `TrackEvent` catalogue, which
 *  is also what main emits against. Returns an unsubscribe fn. */
export const onAppEvent = (
  cb: (e: { name: string } & Record<string, unknown>) => void,
): (() => void) => {
  const handler = (_e: IpcRendererEvent, payload: { name: string } & Record<string, unknown>) =>
    cb(payload);
  ipcRenderer.on("app:event", handler);
  return () => ipcRenderer.removeListener("app:event", handler);
};

/** App + runtime component versions (for the Versions settings tab). */
export const app = {
  versions: (): Promise<AppVersions> => ipcRenderer.invoke("app:versions"),
  /** Report the theme's shell tone so the WINDOW's own background (the contour at the
   *  rounded corners, and the strip a resize exposes) matches the app instead of a fixed
   *  near-white. Send the COMPUTED `--surface-shell` — main keeps no theme→colour table,
   *  so `styles.css` stays the single home for those values. Resolves `false` when the
   *  value isn't `#rrggbb`: main refuses it rather than repairing it. */
  setWindowTone: (tone: string): Promise<boolean> =>
    ipcRenderer.invoke("window:set-tone", tone),
};

/** Auto-update controls (electron-updater ↔ the apps/updates Worker feed).
 *  `pin` forces an exact build (rollback / forced version). `onStatus`
 *  streams progress; returns an unsubscribe. */
export const updates = {
  current: (): Promise<UpdatesCurrent> => ipcRenderer.invoke("updates:current"),
  revealLog: (): Promise<void> => ipcRenderer.invoke("updates:reveal-log"),
  list: (): Promise<UpdatesReleaseList> => ipcRenderer.invoke("updates:list"),
  permissions: (): Promise<{ allow_self_pin: boolean }> =>
    ipcRenderer.invoke("updates:permissions"),
  check: (): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke("updates:check"),
  pin: (version: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke("updates:pin", { version }),
  setChannel: (channel: string): Promise<{ ok: boolean; channel: string }> =>
    ipcRenderer.invoke("updates:set-channel", { channel }),
  listAll: (): Promise<AllDesktopReleases> => ipcRenderer.invoke("updates:list-all"),
  switchTo: (arg: { channel: string; version: string }): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke("updates:switch", arg),
  install: (): Promise<void> => ipcRenderer.invoke("updates:install"),
  onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, s: UpdateStatus) => cb(s);
    ipcRenderer.on("updates:status", handler);
    return () => ipcRenderer.removeListener("updates:status", handler);
  },
  /** La sonde de QUIESCENCE de l'auto-installation (`updates/autoInstall.ts`) : main
   *  demande « es-tu occupé ? » au moment de décider un redémarrage automatique ; le
   *  renderer répond par `replyQuiescence`. Pas de réponse ⇒ main lit « occupé »
   *  (fail-closed), donc un préload non redémarré dégrade en « jamais d'auto-install ». */
  onQuiescenceAsk: (cb: (askId: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, askId: string) => cb(askId);
    ipcRenderer.on("updates:quiescence", handler);
    return () => ipcRenderer.removeListener("updates:quiescence", handler);
  },
  replyQuiescence: (askId: string, busy: boolean): void => {
    ipcRenderer.send(`updates:quiescence-reply:${askId}`, busy);
  },
};

/** Build/runtime flags surfaced to the renderer. */
/** L'environnement résolu, tel que main le remet au renderer. Les types vivent ici (le
 *  preload est le contrat) plutôt qu'importés de main : il ne dépend que d'`electron`. */
export interface ResolvedEnv {
  name: "production" | "staging";
  backend: string;
  admin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  redactFn: string;
}

export type EnvSwitchResult =
  | { ok: true; env: "production" | "staging"; relaunching: boolean }
  | { ok: false; reason: "unknown_env" | "not_privileged" | "write_failed"; env: "production" | "staging" };

export const env = {
  /** True only under a TEST launch (main's `OPENMASQ_E2E`). Async because a
   *  sandboxed preload has no `process.env` — main is the only source. Gates the
   *  renderer `E2eBridge`; false (and inert) in every shipped build. */
  isE2e: (): Promise<boolean> => ipcRenderer.invoke("app:is-e2e"),
  /** Retired: gated the Cloudflare-loop watchdog of the removed keyless webview.
   *  Kept as a constant `false` (nothing reads it) so the preload has ZERO Node
   *  dependency and can run under `sandbox:true` (audit M-1) — `process.env` is
   *  not reliably available in a sandboxed preload. */
  disableCfWatchdog: false,
  /**
   * L'environnement RÉSOLU de cette instance (nom + adresses publiques), lu en
   * **synchrone**. Le renderer en a besoin au chargement de `appEnv.ts`, avant que
   * `auth.ts` ne construise le client Supabase — un `invoke` arriverait trop tard.
   * Un seul échange, au tout début du boot. Rien de secret n'y transite.
   *
   * `null` quand main n'a pas encore branché la famille (un preload non redémarré en
   * dev) : l'appelant retombe alors sur les valeurs bakées, comme avant.
   */
  resolved: (): ResolvedEnv | null => {
    try {
      return (ipcRenderer.sendSync("env:resolved-sync") as ResolvedEnv) ?? null;
    } catch {
      return null;
    }
  },
  /** Demander la bascule d'environnement. La décision est prise et vérifiée en MAIN
   *  (allow-list + permission serveur, fail-closed) — ceci ne fait que la demander.
   *  `token` est le jeton Supabase du compte : main le porte au backend de production,
   *  qui répond pour CE compte (drapeau `staging_tester`) ; sans lui, seul le
   *  dépannage par machine (`allow_self_pin`) peut autoriser. */
  switchTo: (env: string, token?: string): Promise<EnvSwitchResult> =>
    ipcRenderer.invoke("env:switch", { env, token }),
};
