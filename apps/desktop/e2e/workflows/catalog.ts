// The e2e workflows catalog: real prompts + expectations (see the spec).
/** Fixtures' PII that the `patterns` engine catches (emails + intl phone): NONE
 *  must reach the wire. Proper names (AI category, off in patterns) are
 *  deliberately excluded from the assertion. */
export const FIXTURE_PII = [
  "camille.vernay@exemple-corp.fr",
  "jp.bertholet@bertholet-associes.fr",
  "no-reply@notif.exemple.fr",
  "+33 6 12 34 56 78",
];
/** The REAL recipient typed in the email-send prompt. */
export const REAL_TO = "l.morvan@exemple-corp.fr";

export interface Workflow {
  id: string;
  prompt: string;
  /** Fixture servers we expect at least one call to (tools-capable model).
   *  EMPTY = tool-less prompt: the app must answer in a simple flow, calling nothing. */
  servers: string[];
  /** On WHICH surface the write must be confirmed — this is a security assertion,
   *  not a staging detail: `"system"` = the non-spoofable main window (send,
   *  invitation, deletion…), `"chat"` = the card in the conversation (local and
   *  reversible gesture). The classification comes from `@openmasq/catalog/mcp` `writeRisk`, and this field
   *  is what stops a send from sliding onto the surface the renderer can click. */
  write?: "system" | "chat";
  /** Content hints, checked SOFT ONLY under E2E_STRICT=1. */
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
    write: "system", // a send goes out to a third party and can't be undone
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
    write: "system", // an event notifies its invitees
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
    // NB: the real tool is `list_payment_intents` (mcp.stripe.com), not "list_payments".
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
    write: "chat", // a task in its own space: local and reversible
    contentHints: [/tâche|créée|ajoutée/i],
  },

  // ── Additions: the most mundane requests that were missing ────────────────────────
  {
    // The most frequent gesture after "summarize my inbox": reply. And it's
    // deliberately phrased "don't send it" — a draft is a LOW-risk
    // write, so it must be confirmed WITHIN the conversation, never through a
    // system window. It's `send-email`'s counterpart: same connector, different surface.
    id: "draft-reply",
    prompt:
      "Réponds à Camille pour décaler le point budget à mardi 14h — prépare le brouillon, ne l'envoie pas.",
    servers: ["gmail"],
    write: "chat",
    contentHints: [/brouillon|préparé/i],
  },
  {
    // "Where's that email again?" — searching is more frequent than summarizing.
    id: "search-inbox",
    prompt: "Retrouve l'email où on parle du contrat et de la clause de résiliation.",
    servers: ["gmail"],
    contentHints: [/résiliation|contrat/i],
  },
  {
    // The first prompt of the day, and it crosses TWO connectors — this is where
    // the results get re-redacted in a chain.
    id: "today-plan",
    prompt: "Prépare ma journée : ce que j'ai à l'agenda et ce qui attend une réponse dans mes mails.",
    servers: ["google-calendar", "gmail"],
    contentHints: [/agenda|réunion|email/i],
  },
  {
    // After a meeting, nobody asks for a summary: they ask WHO DOES WHAT.
    id: "meeting-actions",
    prompt: "Sors-moi les décisions et les actions de ma dernière réunion — qui fait quoi, pour quand.",
    servers: ["fireflies"],
    contentHints: [/action|décision|relance/i],
  },
  {
    // Low-risk write on a SECOND connector: a note stays within the user's
    // CRM. Verifies the "chat" surface isn't an Asana-specific special case.
    id: "crm-note",
    prompt:
      "Note dans le CRM que Jean-Pierre Bertholet demande une remise de 10 % avant de signer.",
    servers: ["attio"],
    write: "chat",
    contentHints: [/note|CRM|ajoutée/i],
  },
  {
    // The most common use of an assistant, across every product: writing a text.
    // No tool must be called — and the TYPED PII (the address) must not go out.
    id: "compose-followup",
    prompt:
      "Rédige une relance courte et polie pour un client qui n'a pas répondu depuis dix jours. Signe « Léa Morvan — l.morvan@exemple-corp.fr ».",
    servers: [],
    contentHints: [/relance|bonjour|cordialement/i],
  },
  {
    // The raw paste: an email signature, to sort out. Everything pasted is
    // PII, and nothing justifies a tool — it's the case densest in real data.
    id: "extract-contact",
    prompt:
      "Range-moi ce contact : « Camille Vernay, Directrice financière, Exemple-Corp, camille.vernay@exemple-corp.fr, +33 6 12 34 56 78 ». Nom, rôle, société, email, téléphone.",
    servers: [],
    contentHints: [/Vernay|financi|Exemple-Corp/i],
  },
];
