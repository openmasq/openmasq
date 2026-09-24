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

/** Microphone access: macOS needs its OS-level (TCC) prompt, a Chromium grant alone
 *  fails under the hardened runtime. */
export const media = {
  ensureMicAccess: (): Promise<boolean> => ipcRenderer.invoke("media:ensure-mic"),
};

/**
 * SYSTEM notification when a reply arrives out of view. ⚠️ No content ever transits:
 * `title`/`body` carry no conversation text (`state/replyNotice.ts`).
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

/** This machine's Claude Code skills. The renderer passes NO path: main enumerates. */
export const claudeSkills = {
  list: (): Promise<{ folder: string; text: string; siblings: string[]; from: "home" | "project" }[]> =>
    ipcRenderer.invoke("claude-skills:list"),
};

/** Link-unfurl (opt-in). Main fetches safely and inlines the image as a `data:` URL. */
export const links = {
  preview: (url: string): Promise<LinkPreviewData | null> =>
    ipcRenderer.invoke("links:preview", url),
  // Main tracks the opt-in as the AUTHORITATIVE flag (default OFF, fail-closed).
  setEnabled: (on: boolean): Promise<void> =>
    ipcRenderer.invoke("links:set-enabled", on),
};

/** Sandboxed Python. `files` = earlier deliverables seeded into the run's working dir
 *  (main re-sanitizes them). */
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

/** HTML → PDF bytes in an isolated, script-less, network-less window. Rejects on any
 *  failure, so the caller falls back to the in-renderer exporter. */
export const pdf = {
  renderHtml: (req: { html: string; css: string; title: string }): Promise<Uint8Array> =>
    ipcRenderer.invoke("pdf:render-html", req),
};

/** Batch web reader over main's hardened `safeFetch`. The renderer passes REAL URLs;
 *  main never sees the vault. */
export const web = {
  fetchMany: (
    urls: string[],
  ): Promise<{ url: string; ok: boolean; finalUrl?: string; text?: string; error?: string }[]> =>
    ipcRenderer.invoke("web:fetch-many", urls),
};

/** Live model catalogue; `[]` on any failure. */
export const models = {
  listOpenRouter: (): Promise<DynamicModel[]> => ipcRenderer.invoke("models:list-openrouter"),
  /** The ids the user's OWN openai-compat server serves (`/models`); [] on any failure. */
  listLocal: (baseUrl: string): Promise<string[]> => ipcRenderer.invoke("models:list-local", baseUrl),
};

/** The `<protocol>://auth/callback` deep link forwarded by main; the renderer exchanges
 *  its PKCE code. */
export const auth = {
  /** Signals readiness so main flushes a link that arrived before the renderer mounted. */
  onCallback: (cb: (url: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on("auth:callback", handler);
    ipcRenderer.send("auth:ready");
    return () => ipcRenderer.removeListener("auth:callback", handler);
  },
};

/** The `<protocol>://billing/callback` deep link bounced after checkout. */
export const billing = {
  onCallback: (cb: (url: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on("billing:callback", handler);
    // Reuse the shared readiness gate so a link buffered at boot flushes.
    ipcRenderer.send("auth:ready");
    return () => ipcRenderer.removeListener("billing:callback", handler);
  },
};

/** Main-process errors, forwarded to the renderer's anonymised `captureError`. */
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

/** Main-process analytics events, forwarded to the consent-gated `captureEvent`; the
 *  renderer casts them back to the `TrackEvent` catalogue main emits against. */
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
  /** The COMPUTED `--surface-shell`, so the WINDOW's own background matches the theme
   *  without main keeping a colour table. `false` when not `#rrggbb`: main refuses it. */
  setWindowTone: (tone: string): Promise<boolean> =>
    ipcRenderer.invoke("window:set-tone", tone),
};

/** Auto-update controls. `pin` forces an exact build. */
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
  /** The auto-install QUIESCENCE probe (`updates/autoInstall.ts`). No reply ⇒ main reads
   *  "busy" (fail-closed). */
  onQuiescenceAsk: (cb: (askId: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, askId: string) => cb(askId);
    ipcRenderer.on("updates:quiescence", handler);
    return () => ipcRenderer.removeListener("updates:quiescence", handler);
  },
  replyQuiescence: (askId: string, busy: boolean): void => {
    ipcRenderer.send(`updates:quiescence-reply:${askId}`, busy);
  },
};

/** The resolved environment, as main hands it back. The types live HERE (the preload is
 *  the contract, and depends only on `electron`). */
export type EnvName = "production" | "staging" | "custom";

/** The SELF-HOSTED stack entered by the user: public addresses and a PUBLISHABLE key. */
export interface CustomStack {
  backend: string;
  gateway: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface ResolvedEnv {
  name: EnvName;
  backend: string;
  admin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  redactFn: string;
  /** Does this build honor an entered stack (`OPENMASQ_ALLOW_CUSTOM_STACK=1`)? */
  customStackAllowed: boolean;
  /** The stack already known from the pointer, to pre-fill the screen — `null` without. */
  customStack: CustomStack | null;
}

export type EnvSwitchResult =
  | { ok: true; env: EnvName; relaunching: boolean }
  | {
      ok: false;
      reason: "unknown_env" | "not_privileged" | "write_failed" | "custom_not_allowed" | "custom_not_configured";
      env: EnvName;
    };

/** Verdict of writing an entered stack — decided in MAIN (validation + native dialog). */
export type SetCustomStackResult =
  | { ok: true; relaunching: true }
  | { ok: false; reason: "custom_not_allowed" | "invalid" | "declined" | "write_failed"; field?: keyof CustomStack; detail?: string };

export const env = {
  /** True only under a TEST launch. Async: a sandboxed preload has no `process.env`. */
  isE2e: (): Promise<boolean> => ipcRenderer.invoke("app:is-e2e"),
  /** Retired flag, kept a constant `false` so the preload has ZERO Node dependency. */
  disableCfWatchdog: false,
  /**
   * The RESOLVED environment, read SYNCHRONOUSLY: `appEnv.ts` needs it at load, before
   * the auth client is built. Nothing secret transits. `null` ⇒ the baked values.
   */
  resolved: (): ResolvedEnv | null => {
    try {
      return (ipcRenderer.sendSync("env:resolved-sync") as ResolvedEnv) ?? null;
    } catch {
      return null;
    }
  },
  /** Request the environment switch; decided and verified in MAIN (fail-closed). `token`
   *  lets the API answer for THIS account; without it only the per-machine permission can. */
  switchTo: (env: string, token?: string): Promise<EnvSwitchResult> =>
    ipcRenderer.invoke("env:switch", { env, token }),
  /** Write a SELF-HOSTED stack and switch to it: validated in main, then a NATIVE dialog
   *  only a human can click. The handler only exists in a build that honors it. */
  setCustomStack: (stack: CustomStack): Promise<SetCustomStackResult> =>
    ipcRenderer.invoke("env:set-custom-stack", stack),
  /** Forget the entered stack and revert to the default environment (native dialog too). */
  forgetCustomStack: (): Promise<SetCustomStackResult> => ipcRenderer.invoke("env:forget-custom-stack"),
};
