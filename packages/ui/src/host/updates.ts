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
  /** Révèle le fichier `updater.log` dans le gestionnaire de fichiers — la seule trace
   *  de la vraie raison d'un `quitAndInstall` (chemin fixe côté main). Optionnel :
   *  absent, le bouton ne se rend pas. */
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
  /** La sonde de QUIESCENCE de l'auto-installation : main demande « es-tu occupé ? »
   *  avant un redémarrage automatique (build téléchargé + app en arrière-plan/inactive),
   *  et l'UI répond via `replyQuiescence` — occupé = un envoi en vol OU un brouillon non
   *  envoyé quelque part (mémoire seulement : un redémarrage le détruirait). Optionnels :
   *  absents (préload non redémarré, aperçu web), main ne reçoit rien et lit « occupé »
   *  — l'auto-installation dégrade en « jamais », pas en « au hasard ». */
  onQuiescenceAsk?(cb: (askId: string) => void): () => void;
  replyQuiescence?(askId: string, busy: boolean): void;
}

/** Verdict d'une demande de bascule d'environnement — décidée et REVÉRIFIÉE dans le
 *  processus privilégié du desktop (allow-list de noms + permission serveur, fail-closed) ;
 *  l'UI ne fait que demander et montrer le refus tel quel. */
export interface EnvSwitchResult {
  ok: boolean;
  env: "production" | "staging";
  relaunching?: boolean;
  reason?: "unknown_env" | "not_privileged" | "write_failed";
}

/**
 * L'environnement d'exécution de cette instance (production/staging) et sa bascule.
 * Desktop seulement — la build est UNIQUE, l'environnement est résolu au boot depuis un
 * pointeur local ; basculer réécrit ce pointeur et redémarre. Absent = pas de section.
 */
export interface EnvHost {
  /** Le nom résolu au boot. Un nom, jamais une adresse (l'allow-list vit côté main). */
  name: "production" | "staging";
  switchTo(env: "production" | "staging"): Promise<EnvSwitchResult>;
  /** Le compte porte-t-il le drapeau testeur ? AFFICHAGE seulement (montrer ou non la
   *  proposition) — la vraie garde retourne au serveur au moment de la bascule.
   *  Fail-closed : erreur ⇒ false. */
  stagingTester(): Promise<boolean>;
}
