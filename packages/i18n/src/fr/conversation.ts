/**
 * The FR catalogue's « conversation » slice — the SOURCE language: the
 * conversation screen, its agent browser, and everything bordering a message.
 */
import type { Messages } from "../messages";

export const conversation = {
  greeting: { morning: "Bonjour", afternoon: "Bonjour", evening: "Bonsoir" },
  starters: {
    cardTip: (category, prompt) => `${category} — ${prompt}`,
    cardAria: (category, prompt) => `${category} : ${prompt}`,
    dismiss: "Ne plus afficher",
    withServices: "Avec vos services",
    cats: {
      "follow-up": "Relance client",
      "contract-review": "Juridique",
      "hr-review": "RH",
      memory: "Mémoire",
      "chat-catchup": "Messages",
      "notes-find": "Notes",
      "files-find": "Fichiers",
    },
    prompts: {
      // DEMONSTRATORS of the one thing the app does: each carries invented personal data
      // (names, an e-mail, a valid IBAN / SIREN / phone shape) that lights up as masked
      // BEFORE it leaves, and comes back in clear in the reply. A plain chat prompt
      // (« l'actualité du jour ») showed nothing a generic assistant doesn't.
      "follow-up": (domain) =>
        `Rédige une relance courtoise à Camille Salvi (camille.salvi@${domain}) : sa facture F-2026-114 de 4 820 € est impayée depuis 30 jours. Rappelle-lui notre IBAN FR76 3000 6000 0112 3456 7890 189.`,
      "contract-review": () =>
        "Repère les clauses à risque dans cet extrait : « La société Lucane SAS, SIREN 732 829 320, 12 rue des Tanneurs à Lyon, représentée par Marc Wulff, s'engage pour 36 mois sans résiliation anticipée ; toute somme due porte intérêt à 15 % l'an. »",
      "hr-review": () =>
        "Résume ce compte rendu en trois actions : « Entretien annuel de Julien Moreau, né le 14/03/1988, joignable au 06 12 34 56 78. Sa manager Sophie Bernard propose une hausse de 6 % et une formation en mars. »",
      // A DEMONSTRATOR, not a memo: named people + a named company (the redaction lights up
      // before the user's eyes BEFORE it goes out) AND several entity-linked facts (cards get
      // born, the « N faits notés » caption clicks through to the Mémoire graph).
      memory: () =>
        "Retiens que sur le projet Horizon, ma cliente Camille Salvi (Atelier Lucane) valide les maquettes et que Marc Wulff gère la facturation.",
      "chat-catchup": (_d, service) =>
        `Résume ce que j'ai raté cette semaine sur ${service}, et liste ce qui attend une réponse de ma part.`,
      "notes-find": (_d, service) =>
        `Retrouve dans ${service} les notes de ma dernière réunion de projet, et liste les décisions prises.`,
      "files-find": (_d, service) =>
        `Retrouve dans ${service} le dernier devis que j'ai reçu, et sors-en le montant et les dates clés.`,
    },
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
    offlineTitle: "Le navigateur est désactivé.",
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
  folderPickFailed: "échec de la sélection",
  folderGrantFailed: "échec de l'autorisation",
  slashRemember: {
    label: "Retenir",
    desc: "Insère « Retiens que… ». Le fait est enregistré dans la Mémoire, sur cet appareil.",
  },
  opening: "Ouverture…",
  memoryToast: "Noté en mémoire",
  clarify: "Préciser",

  writeConfirm: {
    targetTip: (server, tool) => `${server} · ${tool}`,
    alsoOtherChats: "Aussi dans mes autres conversations (jusqu'à la fermeture de l'app)",
  },

  skillTag: {
    show: "Voir la consigne envoyée au modèle",
    hide: "Cacher la consigne",
    promptEyebrow: "Consigne envoyée au modèle",
    edit: "Éditer",
    unavailable: "Consigne indisponible pour ce message.",
  },

  memory: {
    usedTip:
      "Fiches de mémoire jointes à cet envoi, masquées comme le reste. Cliquez pour ouvrir la Mémoire.",
    used: (labels) => `Mémoire utilisée — ${labels}`,
    skippedTip:
      "Ces fiches correspondaient mais n'ont pas été envoyées avec ce message. Cliquez pour ouvrir la fiche.",
    skipped: (parts) => `Mémoire : ${parts}`,
    homographs: (labels, count) =>
      `${labels} non incluse${count > 1 ? "s" : ""} : le nom seul est trop courant. Écrivez-le en entier.`,
    budget: (n) => `${n} fiche${n > 1 ? "s" : ""} écartée${n > 1 ? "s" : ""} : pas assez de place`,
    pendingTip: "Extraction en cours. Le résultat s'affichera ici.",
    pending: "Mise en mémoire…",
    failedTip:
      "Mise en mémoire impossible : rien n'a été enregistré. Redemandez « retiens… » pour réessayer.",
    failed: "Échec de la mise en mémoire. Rien n'a été enregistré. Réessayez.",
    notedTip: "Enregistré dans la Mémoire de cet appareil, à votre demande",
    preferenceSaved: "Préférence enregistrée en mémoire",
    nothingDurable: "Rien à retenir ici",
    undone: "Retiré de la mémoire",
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
      "Remplacé par une valeur de substitution avant d'atteindre le modèle, restauré dans sa réponse",
    protectedCount: (n) => `${n} protégé${n === 1 ? "" : "s"}`,
    protectedSee: "voir",
    autoRoutedTip:
      "Mode Auto : le modèle de cette réponse a été choisi automatiquement selon la tâche.",
    quotaTip: "Quota du fournisseur de ce modèle",
    reasoning: "Réflexion",
    imageWithheld: "Image retenue : elle peut contenir une valeur masquée",
    imageWithheldLoad: "Charger",
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
    realValueTip: "Valeur réelle. Envoyée non masquée seulement si vous la démasquez.",
    orgForced: "Imposé par l'organisation",
    scopeSend: "cet envoi",
    scopeConversation: "cette conversation",
    scopeMessage: "ce message",
    leaveClear: (scope) => `Démasquer · ${scope}`,
    leaveClearKind: (scope) => `Démasquer la catégorie · ${scope}`,
    leaveClearTip: "Réversible : le modèle reçoit la valeur réelle. Remasquez-la en un clic.",
    reMask: (scope) => `Remasquer · ${scope}`,
    reMaskKind: (scope) => `Remasquer la catégorie · ${scope}`,
    reMaskTip: "Masquer à nouveau cette valeur",
    remove: (scope) => `Retirer le masquage · ${scope}`,
    removeTip: "Définitif : cette valeur n'est plus masquée et est envoyée telle quelle.",
    reportTip: "Ouvre « Votre avis » prérempli. N'y collez jamais la valeur réelle.",
    report: "Signaler une erreur",
    sheetLabel: "Masquage",
  },

  struggle: {
    failedTip: (tool) => (tool ? `Un appel d'outil n'a pas abouti : ${tool}` : "Un appel d'outil n'a pas abouti"),
    unknownTool: (connector, action) =>
      `${connector} n'a pas d'action « ${action} ».`,
    ownKeysHint: "Certaines actions nécessitent vos propres clés d'accès.",
    ownKeysHintWithPath:
      "Ouvrez-le dans Réglages → Connecteurs : certaines actions nécessitent vos propres clés d'accès.",
    connectorError: (connector, action) =>
      `${connector} a refusé l'action « ${action} ». Changer de modèle ne résoudra rien. Le plus souvent, l'accès au compte a expiré :`,
    reconnect: "reconnectez-le, puis relancez votre demande.",
    reconnectWithPath: "reconnectez-le dans Réglages → Connecteurs, puis relancez votre demande.",
    noToolUsed: (who) =>
      `${who} a répondu sans utiliser vos connecteurs. Les modèles qui gèrent mieux les outils (Claude, par exemple) s'en servent plus fiablement : changez de modèle sous le message, puis relancez.`,
    badCall: (who, action) =>
      `${who} n'a pas pu formuler une requête valide pour « ${action} ». Les modèles qui gèrent mieux les outils (Claude, par exemple) y parviennent souvent : changez de modèle sous le message.`,
    reconnectTip: (connector) => `Ouvrir les réglages de ${connector} pour reconnecter le compte`,
    reconnectCta: "Reconnecter",
  },
} satisfies Messages["conversation"];
