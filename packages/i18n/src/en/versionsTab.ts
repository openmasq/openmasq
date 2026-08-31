/**
 * The EN catalogue's « versionsTab » slice: Versions — updates, build history, environment.
 */
import type { Messages } from "../messages";

export const versionsTab = {
  switchConfirm: (version, env) =>
    `Switch to version ${version} (${env})? The app will reinstall the ${env} build and restart.`,
  current: "Current",
  noRelease: "No published version.",
  switchTo: "Switch",
  switchToVersion: (v) => `Switch to ${v}`,
  revert: "Revert",
  revertTo: (v) => `Revert to ${v}`,
  install: "Install",
  installVersion: (v) => `Install ${v}`,
  updatesEyebrow: "UPDATES",
  upToDate: (brand) => `${brand} is up to date.`,
  installedEyebrow: "INSTALLED VERSION",
  orSwitchEnv: " or switch between the staging and production versions.",
  orRevert: " or go back to a previous version.",
  historyEyebrow: "VERSION HISTORY",
  locked:
    "Switching and rollback are locked on this device — ask the operator for access (they grant it from your ID above).",
  revealLogTip: "Opens the folder containing updater.log",
  revealLog: "Reveal the update log",
  stagingWarning: "Staging builds are preliminary and may be unstable. Keep them for testing.",
  stateCurrent: "Installed",
  stateAvailable: "Available",
  statePast: "Previous",
  toggleNotes: (expanded, v) => `${expanded ? "Collapse" : "Expand"} the notes for version ${v}`,
  channel: "Channel",
  upToDateSuffix: " · up to date",
  copyIdTip: "Copy this device's ID (to be granted access by the operator)",
  idCopied: "ID copied",
  installRestart: "Install and restart",
  checkUpdates: "Check for updates",
  publishedEyebrow: "WHAT CHANGED",
  noPublished: "No release note published yet.",
  envEyebrow: "ENVIRONMENT",
  envStagingDesc: "Test environment — preview data and services.",
  envProductionDesc: "The app's normal environment.",
  envSwitchConfirm: (env) =>
    `Switch to the ${env} environment? The app restarts and reopens on the ${env} side, with that environment's data.`,
  envSwitchTo: (env) => `Switch to ${env}`,
  envProduction: "Production",
  envStaging: "Staging",
  envCustom: "Custom",
  status: {
    checking: "Checking for updates…",
    available: (v) => `Update ${v} found — downloading…`,
    downloading: (p) => `Downloading… ${p}%`,
    downloaded: (v) => `Version ${v} ready to install.`,
    notAvailable: "You are up to date.",
    unknownError: "Unknown error.",
    withSize: (text, size) => `${text} (${size})`,
  },
  refusal: {
    notPrivileged: (brand) =>
      `Switch refused: this account is not allowed on the test environment. Access is granted by the ${brand} team.`,
    writeFailed: "The switch could not be saved — nothing changed. Try again.",
    generic: "The switch failed. Try again.",
  },
} satisfies Messages["versionsTab"];
