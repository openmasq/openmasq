// Le catalogue des workflows e2e : prompts réels + attentes (voir le spec).
/** PII des fixtures que le moteur `patterns` attrape (emails + tél intl) : AUCUNE ne
 *  doit atteindre le wire. Les noms propres (catégorie IA, off en patterns) sont
 *  volontairement exclus de l'assertion. */
export const FIXTURE_PII = [
  "camille.vernay@exemple-corp.fr",
  "jp.bertholet@bertholet-associes.fr",
  "no-reply@notif.exemple.fr",
  "+33 6 12 34 56 78",
];
/** Le destinataire RÉEL tapé dans le prompt d'envoi d'email. */
export const REAL_TO = "l.morvan@exemple-corp.fr";

export interface Workflow {
  id: string;
  prompt: string;
  /** Serveurs fixtures dont on attend au moins un appel (modèle tools-capable).
   *  VIDE = prompt sans outil : l'app doit répondre en flux simple, sans rien appeler. */
  servers: string[];
  /** Sur QUELLE surface l'écriture doit être confirmée — c'est une assertion de sécurité,
   *  pas un détail de mise en scène : `"system"` = la fenêtre main non-spoofable (envoi,
   *  invitation, suppression…), `"chat"` = la carte dans la conversation (geste local et
   *  réversible). Le classement vient de `@openmasq/catalog/mcp` `writeRisk`, et ce champ
   *  est ce qui empêche un envoi de glisser vers la surface que le renderer peut cliquer. */
  write?: "system" | "chat";
  /** Indices de contenu, vérifiés en soft UNIQUEMENT sous E2E_STRICT=1. */
  contentHints: RegExp[];
}

export const WORKFLOWS: Workflow[] = [
  {
    id: "inbox-brief",
    prompt: "Résume mes derniers emails — qu'est-ce que j'ai raté aujourd'hui ?",
    servers: ["gmail"],
    contentHints: [/budget|contrat|facture/i],
  },
  {
    id: "send-email",
    prompt: `Envoie un email à ${REAL_TO} pour confirmer le rendez-vous de jeudi à 10h30. Sujet : « Confirmation rendez-vous ».`,
    servers: ["gmail"],
    write: "system", // un envoi part chez un tiers et ne se rattrape pas
    contentHints: [/envoyé|envoi/i],
  },
  {
    id: "agenda-week",
    prompt: "Qu'est-ce que j'ai à mon agenda cette semaine ?",
    servers: ["google-calendar"],
    contentHints: [/jeudi|vendredi/i],
  },
  {
    id: "schedule-meeting",
    prompt: "Cale un point de 30 minutes intitulé « Suivi projet » jeudi prochain à 14h dans mon agenda.",
    servers: ["google-calendar"],
    write: "system", // un évènement notifie ses invités
    contentHints: [/créé|ajouté|agenda/i],
  },
  {
    id: "meeting-brief",
    prompt: "Prépare-moi pour ma prochaine réunion : contexte, participants, et ce qui s'est dit la dernière fois.",
    servers: ["google-calendar", "fireflies"],
    contentHints: [/réunion|comité/i],
  },
  {
    id: "doc-summary",
    prompt: "Retrouve le contrat Exemple-Corp dans mon Drive et résume ses points clés.",
    servers: ["google-drive"],
    contentHints: [/24 mois|résiliation|préavis/i],
  },
  {
    id: "crm-lead",
    prompt: "Qu'est-ce qu'on sait sur le lead Jean-Pierre Bertholet dans le CRM ?",
    servers: ["attio"],
    contentHints: [/proposition|lead/i],
  },
  {
    id: "payments",
    prompt: "Combien ai-je encaissé ce mois-ci ?",
    servers: ["stripe"],
    contentHints: [/9[  ]?870|paiement/i],
    // NB: l'outil réel est `list_payment_intents` (mcp.stripe.com), pas "list_payments".
  },
  {
    id: "sprint-status",
    prompt: "Fais-moi le point du sprint en cours : ce qui est fini, en cours, bloqué.",
    servers: ["linear"],
    contentHints: [/bloqué|en cours/i],
  },
  {
    id: "task-add",
    prompt: "Ajoute une tâche : relancer le client vendredi.",
    servers: ["asana"],
    write: "chat", // une tâche dans son propre espace : local et réversible
    contentHints: [/tâche|créée|ajoutée/i],
  },

  // ── Ajouts : les demandes les plus banales qui manquaient ────────────────────────
  {
    // Le geste le plus fréquent après « résume ma boîte » : répondre. Et il est
    // volontairement formulé « ne l'envoie pas » — un brouillon est un écrit à FAIBLE
    // risque, donc il doit se confirmer DANS la conversation, jamais par une fenêtre
    // système. C'est le pendant de `send-email` : même connecteur, autre surface.
    id: "draft-reply",
    prompt:
      "Réponds à Camille pour décaler le point budget à mardi 14h — prépare le brouillon, ne l'envoie pas.",
    servers: ["gmail"],
    write: "chat",
    contentHints: [/brouillon|préparé/i],
  },
  {
    // « Où est ce mail déjà ? » — la recherche est plus fréquente que le résumé.
    id: "search-inbox",
    prompt: "Retrouve l'email où on parle du contrat et de la clause de résiliation.",
    servers: ["gmail"],
    contentHints: [/résiliation|contrat/i],
  },
  {
    // Le premier prompt de la journée, et il traverse DEUX connecteurs — c'est là que
    // les résultats se reredact en chaîne.
    id: "today-plan",
    prompt: "Prépare ma journée : ce que j'ai à l'agenda et ce qui attend une réponse dans mes mails.",
    servers: ["google-calendar", "gmail"],
    contentHints: [/agenda|réunion|email/i],
  },
  {
    // Après une réunion, personne ne demande un résumé : on demande QUI FAIT QUOI.
    id: "meeting-actions",
    prompt: "Sors-moi les décisions et les actions de ma dernière réunion — qui fait quoi, pour quand.",
    servers: ["fireflies"],
    contentHints: [/action|décision|relance/i],
  },
  {
    // Écriture faible-risque sur un SECOND connecteur : une note reste dans le CRM de
    // l'utilisateur. Vérifie que la surface « chat » n'est pas un cas particulier d'Asana.
    id: "crm-note",
    prompt:
      "Note dans le CRM que Jean-Pierre Bertholet demande une remise de 10 % avant de signer.",
    servers: ["attio"],
    write: "chat",
    contentHints: [/note|CRM|ajoutée/i],
  },
  {
    // L'usage le plus courant d'un assistant, tous produits confondus : écrire un texte.
    // Aucun outil ne doit être appelé — et la PII TAPÉE (l'adresse) ne doit pas partir.
    id: "compose-followup",
    prompt:
      "Rédige une relance courte et polie pour un client qui n'a pas répondu depuis dix jours. Signe « Léa Morvan — l.morvan@exemple-corp.fr ».",
    servers: [],
    contentHints: [/relance|bonjour|cordialement/i],
  },
  {
    // Le collage brut : une signature de mail, à trier. Tout ce qui est collé est de la
    // PII, et rien ne justifie un outil — c'est le cas le plus dense en données réelles.
    id: "extract-contact",
    prompt:
      "Range-moi ce contact : « Camille Vernay, Directrice financière, Exemple-Corp, camille.vernay@exemple-corp.fr, +33 6 12 34 56 78 ». Nom, rôle, société, email, téléphone.",
    servers: [],
    contentHints: [/Vernay|financi|Exemple-Corp/i],
  },
];
