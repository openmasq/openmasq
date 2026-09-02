/**
 * The FR catalogue's « versionsTab » slice — the SOURCE language: Versions — updates, build history, environment.
 */
import type { Messages } from "../messages";

export const versionsTab = {
  switchConfirm: (version, env) =>
    `Basculer vers la version ${version} (${env}) ? L'app va réinstaller la build ${env} et redémarrer.`,
  current: "Actuelle",
  noRelease: "Aucune version publiée.",
  switchTo: "Basculer",
  switchToVersion: (v) => `Basculer vers ${v}`,
  revert: "Revenir",
  revertTo: (v) => `Revenir à ${v}`,
  install: "Installer",
  installVersion: (v) => `Installer ${v}`,
  updatesEyebrow: "MISES À JOUR",
  upToDate: (brand) => `${brand} est à jour.`,
  revertConfirm: (version) => `Revenir à la version ${version} ? L'app redémarrera pour l'appliquer.`,
  autoUpdateLead: (brand) => `${brand} se met à jour automatiquement. Vous pouvez vérifier maintenant`,
  installedEyebrow: "VERSION INSTALLÉE",
  orSwitchEnv: " ou basculer entre les versions staging et production.",
  orRevert: " ou revenir à une version précédente.",
  historyEyebrow: "HISTORIQUE DES VERSIONS",
  locked:
    "Bascule et rollback verrouillés pour cet appareil — demandez l'accès à l'opérateur (il l'accorde via son ID ci-dessus).",
  revealLogTip: "Ouvre le dossier contenant updater.log",
  revealLog: "Révéler le journal de mise à jour",
  stagingWarning:
    "Les builds staging sont préliminaires et peuvent être instables. Réservez-les aux tests.",
  stateCurrent: "Installée",
  stateAvailable: "Disponible",
  statePast: "Précédente",
  toggleNotes: (expanded, v) => `${expanded ? "Replier" : "Déplier"} les notes de la version ${v}`,
  channel: "Canal",
  upToDateSuffix: " · à jour",
  copyIdTip: "Copier l'ID de cet appareil (pour accorder l'accès côté opérateur)",
  idCopied: "ID copié",
  installRestart: "Installer et redémarrer",
  checkUpdates: "Rechercher les mises à jour",
  publishedEyebrow: "CE QUI A CHANGÉ",
  noPublished: "Aucune note de version publiée pour le moment.",
  envEyebrow: "ENVIRONNEMENT",
  envStagingDesc: "Environnement de test — données et services de préversion.",
  envProductionDesc: "L'environnement normal de l'app.",
  envSwitchConfirm: (env) =>
    `Basculer vers l'environnement ${env} ? L'app redémarre et rouvre côté ${env}, avec les données de cet environnement.`,
  envSwitchTo: (env) => `Basculer vers ${env}`,
  envProduction: "Production",
  envStaging: "Staging",
  envCustom: "Custom",
  status: {
    checking: "Recherche de mises à jour…",
    available: (v) => `Mise à jour ${v} trouvée — téléchargement…`,
    downloading: (p) => `Téléchargement… ${p}%`,
    downloaded: (v) => `Version ${v} prête à installer.`,
    notAvailable: "Vous êtes à jour.",
    unknownError: "Erreur inconnue.",
    withSize: (text, size) => `${text} (${size})`,
  },
  refusal: {
    notPrivileged: (brand) =>
      `Bascule refusée : ce compte n'est pas autorisé sur l'environnement de test. L'accès s'accorde par l'équipe ${brand}.`,
    writeFailed: "La bascule n'a pas pu être enregistrée — rien n'a changé. Réessayez.",
    generic: "La bascule a échoué. Réessayez.",
  },
} satisfies Messages["versionsTab"];
