/** App + runtime component versions, surfaced to the "Versions" settings tab. */
export interface AppVersions {
  /** The app's own version (package.json / app.getVersion()). */
  app: string;
  electron?: string;
  chrome?: string;
  node?: string;
  v8?: string;
  /** "darwin 24.4.0 (arm64)" — platform release + arch. */
  os?: string;
}

/**
 * Optional app-metadata capability. Present on the desktop shell (reads
 * Electron's `app.getVersion()` + `process.versions`); absent in the browser
 * preview, where the Versions tab degrades to the bundled app version only.
 */
export interface AppHost {
  versions(): Promise<AppVersions>;
  /**
   * Report the theme's shell tone (a computed `#rrggbb`) so the host window's own
   * background follows it — the contour at the rounded corners, and the strip a resize
   * exposes before the renderer repaints. Optional WITHIN the slot: a host may expose
   * app metadata and own no window (the browser preview), and the UI must not care.
   * Resolves `false` when the host refuses the value rather than repairing it.
   */
  setWindowTone?(tone: string): Promise<boolean>;
}

/** Live auto-update status pushed as electron-updater progresses. */
export interface UpdateStatus {
  state: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
  /** Download weight of the update (the .zip), so the UI can show it. */
  sizeBytes?: number;
  /** Stable error kind for a friendly render (e.g. "no_space"). */
  code?: string;
}

/** Current install identity: running version + the update channel + a stable
 *  per-install id (the desktop analogue of a localStorage device id). */
export interface UpdatesCurrent {
  version: string;
  channel: string;
  installId: string;
}

/** One published desktop release, from the updates Worker's release list. */
export interface DesktopRelease {
  version: string;
  checksum?: string;
  notes?: string | null;
  size_bytes?: number | null;
  created_at?: string;
  /** Feed base to pin this exact build (forced up/downgrade). */
  feed_url?: string;
}

export interface UpdatesReleaseList {
  channel: string;
  releases: DesktopRelease[];
}

/** One environment's channel + its published releases, in the privileged
 *  cross-environment list. `env` is "staging" | "production". */
export interface DesktopChannelReleases {
  channel: string;
  env: string;
  releases: DesktopRelease[];
}

/** The privileged cross-environment release list (staging + production). Only
 *  populated when the device has the self-pin permission; otherwise
 *  `privileged:false` and the picker falls back to the device's own channel. */
export interface AllDesktopReleases {
  privileged: boolean;
  channels: DesktopChannelReleases[];
}

/**
 * Optional auto-update capability (desktop only). Backed by electron-updater
 * pointed at the apps/updates Worker feed. `check` looks for the newest eligible
 * release on the channel; `pin` forces an exact version (rollback / forced
 * upgrade, allowDowngrade on); `install` restarts into a downloaded update.
 * Absent in the browser preview → the updates settings section doesn't render.
 */
export interface UpdatesHost {
  current(): Promise<UpdatesCurrent>;
  /** Reveals the `updater.log` file in the file manager — the only trace
   *  of the real reason for a `quitAndInstall` (fixed path on the main side). Optional:
   *  absent, the button doesn't render. */
  revealLog?(): Promise<void>;
  list(): Promise<UpdatesReleaseList>;
  /** This install's self-pin permission (operator-granted). Absent on an
   *  un-restarted preload → the picker degrades to visible (server still
   *  enforces the pin). Present → gates the rollback/pin control. */
  permissions?(): Promise<{ allow_self_pin: boolean }>;
  check(): Promise<{ ok: boolean; reason?: string }>;
  pin(version: string): Promise<{ ok: boolean; reason?: string }>;
  setChannel(channel: string): Promise<{ ok: boolean; channel: string }>;
  install(): Promise<void>;
  /** Privileged cross-environment release list (staging + production). Absent on
   *  an un-restarted preload; present but `privileged:false` when the device
   *  lacks the permission. When privileged, the picker offers switching envs. */
  listAll?(): Promise<AllDesktopReleases>;
  /** Switch this install to an exact build on another channel/environment
   *  (reinstalls the other env's app — its URLs are baked in). */
  switchTo?(arg: { channel: string; version: string }): Promise<{ ok: boolean; reason?: string }>;
  /** Subscribe to live status; returns an unsubscribe. */
  onStatus(cb: (s: UpdateStatus) => void): () => void;
  /** The auto-install QUIESCENCE probe: main asks « es-tu occupé ? »
   *  before an automatic restart (build downloaded + app in background/idle),
   *  and the UI answers via `replyQuiescence` — busy = a send in flight OR an unsent
   *  draft somewhere (memory only: a restart would destroy it). Optional:
   *  absent (un-restarted preload, web preview), main receives nothing and reads « busy »
   *  — the auto-install degrades to « never », not to « at random ». */
  onQuiescenceAsk?(cb: (askId: string) => void): () => void;
  replyQuiescence?(askId: string, busy: boolean): void;
}

/** Verdict of an environment-switch request — decided and RE-VERIFIED in the
 *  desktop's privileged process (name allow-list + server permission, fail-closed);
 *  the UI only asks and shows the refusal as-is. */
/** The environments an instance can open. `custom` = the SELF-HOSTED stack entered
 *  by the user, which only exists in a build that honours it (`CustomStackHost`). */
export type RuntimeEnvName = "production" | "staging" | "custom";

export interface EnvSwitchResult {
  ok: boolean;
  env: RuntimeEnvName;
  relaunching?: boolean;
  reason?: "unknown_env" | "not_privileged" | "write_failed" | "custom_not_allowed" | "custom_not_configured";
}

/** The four addresses of a self-hosted stack — public, and a PUBLISHABLE key. */
export interface CustomStack {
  backend: string;
  gateway: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Verdict of writing a stack — decided OUTSIDE the UI (validation + native dialog). */
export type SetCustomStackResult =
  | { ok: true; relaunching: true }
  | { ok: false; reason: "custom_not_allowed" | "invalid" | "declined" | "write_failed"; field?: keyof CustomStack; detail?: string };

/**
 * The SELF-HOSTED stack: present ONLY in a build that honours it
 * (`OPENMASQ_ALLOW_CUSTOM_STACK=1` — never the official binary). The screen enters and
 * requests; the validation and confirmation (a NATIVE dialog box) live in the
 * privileged process, which restarts the app in a separate profile.
 */
export interface CustomStackHost {
  /** The already-written stack, to pre-fill — `null` without one. */
  current: CustomStack | null;
  set(stack: CustomStack): Promise<SetCustomStackResult>;
  forget(): Promise<SetCustomStackResult>;
}

/**
 * This instance's runtime environment (production/staging/custom) and its switch.
 * Desktop only — the build is UNIQUE, the environment is resolved at boot from a
 * local pointer; switching rewrites this pointer and restarts. Absent = no section.
 */
export interface EnvHost {
  /** The name resolved at boot. A name, never an address (the allow-list lives on the main side). */
  name: RuntimeEnvName;
  switchTo(env: RuntimeEnvName): Promise<EnvSwitchResult>;
  /** Does the account carry the tester flag? DISPLAY only (whether to show the
   *  offer) — the real guard goes back to the server at switch time.
   *  Fail-closed: error ⇒ false. */
  stagingTester(): Promise<boolean>;
  /** Absent = this build doesn't enter a stack (the official binary's case). */
  customStack?: CustomStackHost;
}
