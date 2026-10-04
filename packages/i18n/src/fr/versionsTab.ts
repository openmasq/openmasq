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
    "Le changement de version est verrouillé sur cet appareil. Pour le débloquer, communiquez l'ID ci-dessus à l'opérateur.",
  revealLogTip: "Ouvre le dossier contenant updater.log",
  revealLog: "Afficher le journal de mise à jour",
  stagingWarning:
    "Les builds staging sont préliminaires et peuvent être instables. Réservez-les aux tests.",
  stateCurrent: "Installée",
  stateAvailable: "Disponible",
  statePast: "Précédente",
  toggleNotes: (expanded, v) => `${expanded ? "Replier" : "Déplier"} les notes de la version ${v}`,
  channel: "Canal",
  upToDateSuffix: " · à jour",
  copyIdTip: "Copier l'ID de cet appareil (pour que l'opérateur accorde l'accès)",
  idCopied: "ID copié",
  installRestart: "Installer et redémarrer",
  checkUpdates: "Rechercher les mises à jour",
  publishedEyebrow: "CE QUI A CHANGÉ",
  noPublished: "Aucune note de version publiée pour le moment.",
  envEyebrow: "ENVIRONNEMENT",
  envStagingDesc: "Environnement de test : données et services de préversion.",
  envProductionDesc: "L'environnement normal de l'app.",
  envSwitchConfirm: (env) =>
    `Basculer vers l'environnement ${env} ? L'app redémarre sur ${env}, avec les données de cet environnement.`,
  envSwitchTo: (env) => `Basculer vers ${env}`,
  envProduction: "Production",
  envStaging: "Staging",
  envCustom: "Personnalisé",
  status: {
    checking: "Recherche de mises à jour…",
    available: (v) => `Mise à jour ${v} trouvée. Téléchargement…`,
    downloading: (p) => `Téléchargement… ${p}%`,
    downloaded: (v) => `Version ${v} prête à installer.`,
    notAvailable: "Vous êtes à jour.",
    unknownError: "Erreur inconnue.",
    withSize: (text, size) => `${text} (${size})`,
    errors: {
      noSpace: "Espace disque insuffisant pour installer la mise à jour. Libérez de l'espace, puis réessayez.",
      readOnlyVolume: (brand) =>
        `Pour se mettre à jour, ${brand} doit être dans le dossier Applications. Déplacez l'app depuis le disque d'installation (ou Téléchargements) vers Applications, puis relancez-la.`,
      appRunning: (brand) => `Une partie de l'app tournait encore. Quittez complètement ${brand}, puis relancez la mise à jour.`,
      signature: "La mise à jour téléchargée n'a pas passé le contrôle d'intégrité. Réessayez.",
      server: "Le serveur de mise à jour est momentanément indisponible. L'app réessaiera automatiquement.",
      download: "Téléchargement de la mise à jour impossible. Vérifiez votre connexion, puis réessayez.",
      network: "Connexion au serveur de mise à jour impossible. Vérifiez votre réseau, puis réessayez.",
      generic: "La mise à jour a échoué. Réessayez plus tard.",
    },
  },
  refusal: {
    notPrivileged: (brand) =>
      `Bascule refusée : ce compte n'est pas autorisé sur l'environnement de test. L'accès s'accorde par l'équipe ${brand}.`,
    writeFailed: "La bascule n'a pas pu être enregistrée. Rien n'a changé. Réessayez.",
    generic: "La bascule a échoué. Réessayez.",
  },
} satisfies Messages["versionsTab"];
