/**
 * The FR catalogue's « settingsMore » slice — the SOURCE language (Paiement, Usage, Vos
 * appareils, Organisation, Import). `satisfies` per entry.
 */
import type { Messages } from "../messages";

export const billingTab = {
  close: "Fermer",
  yourSubscription: "VOTRE ABONNEMENT",
  testerNote: "Dans cette version, l'abonnement s'applique immédiatement et sans paiement.",
  billingClosed:
    "Les abonnements ne sont pas encore disponibles dans cette version. Les offres ci-dessus sont indiquées à titre d'information.",
  unreadable:
    "Impossible de charger votre abonnement. Vérifiez votre connexion, puis rouvrez cet onglet.",
  finalizing: "Finalisation de votre abonnement…",
  cancelAtEnd:
    "Votre abonnement se termine à la fin de la période en cours. Pour le conserver, réactivez-le dans le portail de facturation.",
  billingEyebrow: "FACTURATION",
  stripeManaged: "Géré par Stripe",
  stripeHint: "Gérez votre moyen de paiement, vos factures et vos reçus dans le portail sécurisé.",
  opening: "Ouverture…",
  openPortal: "Ouvrir le portail de facturation",
  stripeSecure: "Les paiements sont traités par Stripe.",
  unavailableHere: "La gestion de l'abonnement n'est pas disponible sur cette plateforme.",
  recommended: "Recommandé",
  perMonth: " / mois",
  noCredits: "Sans crédits inclus",
  creditsIncluded: (amount) => `${amount} de crédits inclus`,
  currentPlan: "Offre actuelle",
  backToFree: "Passer à l'offre gratuite",
  oneMoment: "Un instant…",
  subscribe: "S'abonner",
  choosePlan: "Choisir cette offre",
  downgrade: "Rétrograder",
  upgradeTitle: (name) => `Passer à ${name} ?`,
  downgradeTitle: (name) => `Rétrograder vers ${name} ?`,
  upgradeBody: (name, price) =>
    `Vous passez à ${name} dès maintenant (${price} / mois). La différence est facturée au prorata pour la période en cours.`,
  downgradeBody: (name, price) =>
    `Vous passez à ${name} (${price} / mois). La différence est créditée sur votre prochaine facture.`,
  confirmChange: "Confirmer le changement",
  orgManaged: "Facturation gérée par votre organisation",
  orgCovered: (org) =>
    `Votre accès est payé par l'organisation${org} (facturation par siège). Les offres individuelles ne s'appliquent pas aux membres d'une organisation.`,
  manageInAdmin: "Gérer dans la console admin",
  manageInAdminHint: (brand) => `Gérez l'abonnement de l'organisation dans la console d'administration ${brand}.`,
  creditsEyebrow: "CRÉDITS · CETTE PÉRIODE",
  remainingOf: (remaining, total) => `restants sur ${total}`,
  usedRemaining: (used, remaining, total) => ` utilisés · ${remaining} restants sur ${total}`,
} satisfies Messages["billingTab"];

export const usageTab = {
  filterAria: "Filtrer la consommation",
  filterAll: "Tous",
  filterByo: "Avec mes clés API",
  filterSubscription: "Avec mon abonnement",
  filterIncluded: "Avec les modèles inclus",
  rangeAria: "Période",
  days: (n) => `${n} j`,
  kpiMessages: "Messages",
  kpiTokens: "Tokens",
  kpiTokensSub: "tous modèles",
  kpiCredits: "Crédits utilisés",
  kpiCreditsOf: (total) => `sur ${total}`,
  kpiNoSubscription: "aucun abonnement",
  subByo: "clés API perso",
  subSubscription: "abonnement",
  subIncluded: "modèles inclus",
  subAll: "cumul",
  unattributed: (n) =>
    `${n.toLocaleString("fr-FR")} message${n > 1 ? "s" : ""} envoyé${n > 1 ? "s" : ""} avant le début du suivi (non attribué${n > 1 ? "s" : ""} à des clés ou à un abonnement). Visible${n > 1 ? "s" : ""} sous « Tous ».`,
  estimated: (n) =>
    `${n.toLocaleString("fr-FR")} réponse${n > 1 ? "s" : ""} interrompue${n > 1 ? "s" : ""} : leurs tokens sont estimés. Les fournisseurs ne donnent le décompte exact qu'à la fin d'une réponse, mais facturent les tokens déjà générés.`,
  activityTitle: (days) => `Activité · ${days} derniers jours`,
  activityMeta: (max) => `conversations / jour${max > 0 ? ` · max ${max}` : ""}`,
  activityAria: (days) => `Activité des ${days} derniers jours`,
  dayLabel: (ago, n) => `Il y a ${ago} j · ${n} conversation${n > 1 ? "s" : ""}`,
  perModelTitle: "Usage par modèle",
  perModelEmpty: "Aucun usage enregistré pour l'instant.",
  msgs: (n) => `${n} msg`,
  unknownPrice: "Tarif inconnu (modèle local ou gratuit)",
  tokensNote:
    "Tokens cumulés sur toutes vos conversations. Certains modèles locaux ou gratuits ne transmettent pas de décompte. Le coût est une estimation sur la base des tarifs publics en USD, hors remises et mise en cache.",
  creditsEyebrow: "CRÉDITS · CETTE PÉRIODE",
  creditsNote:
    "Crédits prépayés utilisés par les modèles inclus dans votre offre (sans clé API personnelle). C'est votre solde réel.",
  orgLabel: "Organisation",
  mySubscription: "Mon abonnement",
  myAccount: "Mon compte",
  timelineTitle: (days) => `Messages · ${days} derniers jours`,
  timelineMeta: (max) => `messages / jour, par modèle${max > 1 ? ` · max ${max}` : ""}`,
  timelineEmpty: "Aucun message sur la période.",
  timelineAria: "Messages par jour et par modèle",
  other: "Autres",
} satisfies Messages["usageTab"];

export const syncTab = {
  paidEyebrow: "Fonctionnalité payante",
  paidTitle: "La synchro sur tous vos appareils",
  paidBody:
    "Vos règles, votre coffre et votre historique sur tous vos appareils, chiffrés de bout en bout. Inclus dans les offres payantes.",
  paidPoint1: "Multi-appareils en temps réel",
  paidPoint2: "Chiffré de bout en bout",
  paidPoint3: "Inclus dans les abonnements payants",
  eyebrow: "Synchronisation",
  devicesEyebrow: "Appareils connectés",
  deviceCount: (n) => `${n} ${n === 1 ? "appareil" : "appareils"}`,
  noDevices:
    "Aucun autre appareil pour l'instant. Saisissez la même phrase secrète sur un autre appareil pour le voir ici.",
  ok: "OK",
  cancel: "Annuler",
  device: "Appareil",
  current: "● Cet appareil",
  seen: "vu",
  rename: "Renommer",
  revoke: "Révoquer",
  platforms: { desktop: "Ordinateur", extension: "Navigateur", mobile: "Mobile", web: "Web" },
  passTitle: "Synchroniser cet appareil",
  passDesc: "Règles, historique et catégories, chiffrés de bout en bout",
  passActive: "Active",
  passUnset: "Non définie",
  // ⚠️ Ce que la synchronisation envoie, c'est le texte NON MASQUÉ de la conversation
  // et les documents d'origine (`@openmasq/sync` `convSync.ts`) — chiffrés avec cette
  // phrase avant l'envoi, puis stockés chiffrés sur le serveur. La version
  // précédente disait « vos données masquées […] ne quittent jamais vos appareils »,
  // ce qui était faux deux fois. Règle 8 : on ne promet que ce que le code fait.
  passNote: {
    lead: "Vos conversations, vraies valeurs et documents joints compris, sont chiffrées avec cette phrase ",
    before: "avant",
    mid: " d'atteindre le serveur. Le serveur les conserve mais ne peut pas les lire. La phrase reste sur vos appareils et nous ne pouvons pas la récupérer. Saisissez la ",
    same: "même",
    tail: " phrase sur chaque appareil pour les synchroniser.",
  },
  passSaveFailed: "La phrase n'a pas pu être enregistrée. Reconnectez-vous, puis réessayez.",
  passDisableFailed: "La synchronisation n'a pas pu être désactivée. Réessayez.",
  passMismatch:
    "Cette phrase secrète ne correspond pas à celle de vos autres appareils : leurs données synchronisées sont illisibles ici, et inversement. Utilisez la même phrase secrète sur chaque appareil.",
  passPlaceholder: "Au moins 8 caractères…",
  generate: "Générer",
  save: "Enregistrer",
  change: "Changer",
  disable: "Désactiver",
  passOffline:
    "La synchronisation n'est pas encore disponible dans cette version. Votre phrase secrète est enregistrée sur cet appareil et servira dès que la synchronisation sera disponible.",
  envEyebrow: "Environnement",
  envProduction: "Production",
  envStaging: "Staging",
  statusEyebrow: "Synchronisation",
  justNow: "à l'instant",
  minutesAgo: (m) => `il y a ${m} min`,
  hoursAgo: (h) => `il y a ${h} h`,
  daysAgo: (d) => `il y a ${d} j`,
  yesterday: "hier",
  failure: "échec",
  failureMismatch: "Réessayer ne changera rien. Vérifiez la phrase secrète de cet appareil.",
  failureRetry: "Nouvel essai automatique.",
  failedAt: (when, reason, tail) => `Échec ${when} — ${reason}. ${tail}`,
  lastOk: (when) => `Dernière synchro réussie ${when}.`,
  noExchange: "Aucune synchro depuis le lancement de l'app.",
} satisfies Messages["syncTab"];

export const orgTab = {
  eyebrow: "Votre organisation",
  yourOrg: "Votre organisation",
  roleOwner: "Propriétaire",
  roleAdmin: "Administrateur",
  roleMember: "Membre",
  planFree: "Gratuit",
  planPro: "Business",
  plan: (name) => `plan ${name}`,
  members: "membres",
  yourRole: "votre rôle",
  rules: (n) => (n === 1 ? "règle imposée" : "règles imposées"),
  accessEyebrow: "Accès",
  forcedTitle: "Règles imposées par votre organisation",
  forcedList: (list) => `${list} (non désactivables)`,
  forcedNone: "Aucune règle imposée",
  active: "ACTIVES",
  adminConsole: "Console d'administration",
  adminConsoleHint: "Gérer les membres, l'usage et la sécurité",
  minimalNote: (org) => `Le masquage minimal est imposé par ${org} et ne peut pas être désactivé.`,
} satisfies Messages["orgTab"];

export const importModal = {
  title: "Importer des conversations",
  beta: "Bêta",
  sub: "Importez vos conversations depuis l'export officiel d'un autre assistant. Tout se passe sur votre appareil. Le fichier n'est envoyé nulle part.",
  hintChatgpt:
    "chatgpt.com → Réglages → Contrôles des données → Exporter. Déposez ici le .zip reçu par e-mail.",
  hintClaude:
    "claude.ai → Réglages → Confidentialité → Exporter. Déposez ici l'archive reçue par e-mail.",
  geminiNote: "Gemini : pas encore. Google Takeout ne conserve pas la structure des conversations.",
  choose: (provider) => `Choisir le fichier d'export ${provider}…`,
  maskedNote:
    "Les valeurs sensibles sont masquées dès l'import. Si vous poursuivez ici une conversation importée, le modèle ne voit que son historique masqué.",
  redacting: (done, total) => `Masquage des conversations… ${done} / ${total}`,
  reading: "Lecture de l'export…",
  imported: (n) => `${n.toLocaleString("fr-FR")} conversation${n === 1 ? "" : "s"} importée${n === 1 ? "" : "s"}`,
  skipped: (n) => ` · ${n.toLocaleString("fr-FR")} déjà présente${n === 1 ? "" : "s"} (ignorée${n === 1 ? "" : "s"})`,
  doneNote:
    "Les conversations importées sont masquées avec la détection de base uniquement. Vos nouveaux messages bénéficient de la détection complète à l'envoi.",
  close: "Fermer",
  failed: "L'import a échoué. Réessayez.",
} satisfies Messages["importModal"];
