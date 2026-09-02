/**
 * The FR catalogue's « conversation » slice — the SOURCE language: the
 * conversation screen, its agent browser, and everything bordering a message.
 */
import type { Messages } from "../messages";

export const conversation = {
  greeting: { morning: "Bonjour", afternoon: "Bon après-midi", evening: "Bonsoir" },
  starters: {
    noSetup: "Sans rien configurer",
    withServices: "Avec vos services",
    orConnect: "Ou connectez",
    seeOthers: "Voir les autres",
    cardTip: (category, prompt) => `${category} — ${prompt}`,
    cardAria: (category, prompt) => `${category} : ${prompt}`,
    connectTip: (connector, prompt) => `Connecter ${connector} — ${prompt}`,
    dismiss: "Ne plus proposer",
  },

  artifact: { pane: "Aperçu du fichier", copy: "Copier", copied: "Copié", close: "Fermer" },

  browser: {
    pane: "Navigateur agent",
    bookmarks: "Favoris",
    askAboutPage: "Poser une question sur cette page",
    askAboutPageLabel: "Demander à propos de cette page",
    embedded: "Navigateur intégré",
    unavailable: "Navigateur agent indisponible sur cette plateforme.",
    loading: "Chargement du navigateur agent…",
    offlineTitle: "Le navigateur n'est pas connecté.",
    offlineSub: (brand) =>
      `Activez-le pour consulter le web ici, et laisser ${brand} y chercher pour vous.`,
    activating: "Activation…",
    activate: "Activer le navigateur",
    searchEngine: "Moteur de recherche",
    back: "Précédent",
    forward: "Suivant",
    reload: "Recharger",
    urlPlaceholder: "Rechercher ou saisir une adresse",
    urlAria: "Adresse ou recherche",
    closeBrowser: "Fermer le navigateur",
    close: "Fermer",
  },

  resizePanel: "Redimensionner le panneau",
  suspendedTitle: "Accès suspendu par votre organisation",
  suspendedBody: "L'envoi est bloqué. Contactez l'administrateur de votre organisation.",
  docPrep: {
    analysing: "Analyse du document…",
    redacting: "Masquage du document…",
    page: (page, total) => ` · page ${page} / ${total}`,
    pages: (total) => ` · ${total} page${total > 1 ? "s" : ""}`,
    ofCount: (idx, count) => ` (${idx}/${count})`,
  },
  chooseFolder: "Choisir le dossier",
  folderPickFailed: "sélection impossible",
  folderGrantFailed: "échec de l'autorisation",
  slashRemember: {
    label: "Retenir en mémoire",
    desc: "Insère « Retiens que… » — le fait durable sera noté dans la Mémoire, localement.",
  },
  opening: "Ouverture…",
  memoryToast: "Noté en mémoire",
  clarify: "Préciser",

  writeConfirm: {
    targetTip: (server, tool) => `${server} · ${tool}`,
    alsoOtherChats: "Aussi dans mes autres conversations (jusqu'à la fermeture de l'app)",
  },

  skillTag: {
    show: "Voir l'instruction envoyée au modèle",
    hide: "Masquer l'instruction envoyée",
    promptEyebrow: "Instruction envoyée au modèle",
    edit: "Éditer",
    unavailable: "Instruction indisponible pour ce message.",
  },

  memory: {
    usedTip:
      "Souvenirs injectés avec cet envoi, masqués comme le reste — cliquez pour ouvrir la Mémoire",
    used: (labels) => `Mémoire utilisée — ${labels}`,
    skippedTip:
      "Ces souvenirs correspondaient mais ne sont pas partis avec cet envoi — cliquez pour ouvrir la fiche",
    skipped: (parts) => `Mémoire : ${parts}`,
    homographs: (labels, count) =>
      `${labels} non injectée${count > 1 ? "s" : ""} — nom trop courant seul, écrivez-le en entier`,
    budget: (n) => `${n} fiche${n > 1 ? "s" : ""} écartée${n > 1 ? "s" : ""} faute de place`,
    pendingTip: "Extraction en cours — le résultat s'affichera ici",
    pending: "Mise en mémoire…",
    failedTip:
      "Mise en mémoire impossible : rien n'a été enregistré. Redemandez « retiens… » pour réessayer.",
    failed: "Mise en mémoire échouée — rien n'a été noté, réessayez",
    notedTip: "Mémoire locale (page Mémoire) — demande explicite de retenir",
    preferenceSaved: "Préférence enregistrée en mémoire",
    nothingDurable: "Rien de durable à retenir en mémoire",
    undone: "Souvenir retiré de la mémoire",
    noted: (facts, profile, updatedSuffix) =>
      `${facts === 1 ? "1 fait noté" : `${facts} faits notés`}${profile ? " + profil" : ""}${updatedSuffix} en mémoire`,
    updatedSuffix: (n) => ` · ${n === 1 ? "1 fiche mise à jour" : `${n} fiches mises à jour`}`,
    undo: "Annuler",
    undoTip: "Retirer de la mémoire ce que cette demande a créé",
  },

  actions: {
    copy: "Copier",
    copied: "Copié",
    regenerate: "Régénérer",
    fork: "Dupliquer la conversation à partir d'ici",
    feedback: "Donner un avis sur cette réponse",
  },

  bubble: {
    openAttachment: (name) => `Consulter ${name}`,
    plotTip: "Génération d'un graphique (run_python)",
    plot: "Graphique",
    redactionFailedTip: "Le modèle de masquage a échoué pour ce message",
    redactedTip:
      "Remplacé par des marqueurs avant que le modèle ne le voie, restauré dans sa réponse",
    protectedCount: (n) => `${n} protégé${n === 1 ? "" : "s"}`,
    protectedSee: "voir",
    autoRoutedTip:
      "Mode Auto : le modèle de cette réponse a été choisi automatiquement selon la tâche.",
    quotaTip: "Quota du fournisseur de ce modèle",
    reasoning: "Réflexion",
  },

  trace: {
    connector: "connecteur",
    calling: "Appel des outils…",
    running: "en cours…",
    actionsRunning: (n) => `${n} action${n > 1 ? "s" : ""} · en cours…`,
    actionsDone: (n) => `${n} action${n > 1 ? "s" : ""} · terminé`,
    retrying: (attempt) => `nouvel essai (${attempt}ᵉ)`,
    attempts: (n) => `${n} tentatives`,
    failed: "échec",
    failedWith: (note) => `échec — ${note}`,
    declined: "refusé",
  },

  thinking: {
    writing: "Le modèle rédige la réponse",
    reflecting: "Le modèle réfléchit",
    preparing: "Le modèle prépare la réponse",
  },

  tokens: {
    tip: (total, input, output) => `${total} tokens (entrée ${input} · sortie ${output})`,
    line: (input, output) => `↑ ${input} · ↓ ${output} tokens`,
  },

  mark: {
    realValue: "valeur réelle",
    seenByModel: "vu par le modèle",
    seenByModelTip: "Valeur vue par le modèle",
    realValueTip: "Valeur réelle — partira en clair si vous la laissez en clair",
    orgForced: "Imposé par l'organisation",
    scopeSend: "cet envoi",
    scopeConversation: "cette conversation",
    scopeMessage: "ce message",
    leaveClear: (scope) => `Laisser en clair · ${scope}`,
    leaveClearKind: (scope) => `Laisser la catégorie en clair · ${scope}`,
    leaveClearTip: "Réversible : la valeur part telle quelle au modèle, le masquage revient d'un clic",
    reMask: (scope) => `Remasquer · ${scope}`,
    reMaskKind: (scope) => `Remasquer la catégorie · ${scope}`,
    reMaskTip: "Masquer à nouveau cette valeur",
    remove: (scope) => `Retirer le masquage · ${scope}`,
    removeTip: "Définitif : plus aucun marqueur — la valeur restera visible et partira en clair",
    reportTip: "Ouvre « Votre avis » prérempli — n'y collez jamais la valeur réelle",
    report: "Signaler une erreur",
    sheetLabel: "Masquage",
  },

  struggle: {
    failedTip: (tool) => (tool ? `Un appel d'outil n'a pas abouti : ${tool}` : "Un appel d'outil n'a pas abouti"),
    unknownTool: (connector, action) =>
      `${connector} ne sait pas faire « ${action} » — cette action n'existe pas dans le connecteur.`,
    ownKeysHint: "Certaines ne s'activent qu'avec vos propres clés d'accès.",
    ownKeysHintWithPath:
      "Ouvrez sa fiche dans Réglages → Connecteurs : certaines ne s'activent qu'avec vos propres clés d'accès.",
    connectorError: (connector, action) =>
      `${connector} a refusé l'action « ${action} ». Le modèle n'y est pour rien : en changer ne changerait rien. Le plus souvent, l'accès au compte a expiré —`,
    reconnect: "reconnectez-le, puis relancez votre demande.",
    reconnectWithPath: "reconnectez-le dans Réglages → Connecteurs, puis relancez votre demande.",
    noToolUsed: (who) =>
      `${who} a répondu sans se servir de vos connecteurs. Un modèle plus à l'aise avec les outils (Claude, par exemple) s'en sert mieux : changez de modèle sous le message, puis relancez.`,
    badCall: (who, action) =>
      `${who} n'a pas réussi à formuler l'action « ${action} ». Un modèle plus à l'aise avec les outils (Claude, par exemple) y parvient souvent : changez de modèle sous le message.`,
    reconnectTip: (connector) => `Ouvrir la fiche ${connector} pour reconnecter le compte`,
    reconnectCta: "Reconnecter",
  },
} satisfies Messages["conversation"];
