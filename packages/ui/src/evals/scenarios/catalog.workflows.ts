// COMPLEX workflow scenarios — multi-tool chains across connectors, the load that
// separates a strong agent from a weak one: pick the right tool among many, CHAIN reads
// (a later call's argument only exists in an earlier call's result), carry a TOOL-BORN
// value into a write, and stop. Same contract machinery as `catalog.ts`; same Karl
// Studio fixture theme; servers from the workflows fleet (`../servers/workflows`).

import { calls, says, type MockRequest } from "../mockModel";
import { ASANA, FIREFLIES, GCAL, GDRIVE, GMAIL, LINEAR, STRIPE_PAYMENTS } from "../servers";
import type { Scenario } from "./index";

const NER = { "Karl Studio": "company", "Jean Vannec": "name" };

/** The first e-mail-shaped token visible anywhere in the model's inbox (a FAKE). */
function emailIn(req: MockRequest): string {
  for (const m of req.messages) {
    // Unicode, not \w: the faker draws French first names in the local part
    // (léa@…, zoé@…, inès@…) and ASCII only caught the tail of it — « a@outlook.com »,
    // whose domain then got un-redacted on its own — or nothing at all (the fallback). This was
    // THE flake in wf2-incident-issue-comm: the per-conversation salt makes the first-name
    // draw random, so the failure only happened on one run out of several.
    const hit = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u.exec(String(m.content ?? ""));
    if (hit) return hit[0].replace(/\.$/, ""); // not a sentence's trailing period
  }
  return "inconnu@exemple.fr";
}

export const WORKFLOW_SCENARIOS: Scenario[] = [
  {
    // READ CHAIN ×3 from ONE prompt: agenda → the matching meeting transcript → the
    // participants' e-mails — then a synthesis. No write; the difficulty is breadth
    // (3 connectors offered, 3 needed) and sequencing without user hand-holding.
    name: "wf-brief-reunion",
    prompts: [
      "Prépare-moi pour ma prochaine réunion : regarde mon agenda, retrouve le compte-rendu de la dernière réunion correspondante et les derniers e-mails liés, puis fais-moi un brief avec les points à suivre.",
    ],
    servers: [GCAL, FIREFLIES, GMAIL],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio", "contact@karl-studio.fr"],
    spec: {
      sequence: [
        { tool: "google-calendar__list_events" },
        { tool: "fireflies__fireflies_get_transcripts" },
      ],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "google-calendar__list_events", args: {} }),
      calls({ name: "fireflies__fireflies_get_transcripts", args: { limit: 5 } }),
      calls({ name: "fireflies__fireflies_get_transcript_details", args: { transcript_id: "tr-981" } }),
      (req) => calls({ name: "gmail__search_messages", args: { query: emailIn(req) } }),
      says("Brief : point jeudi 10h ; au dernier échange le devis est signé, pilote en septembre ; à suivre : planning révisé et démo client."),
    ],
  },

  {
    // READ CHAIN → WRITE with a TOOL-BORN recipient: the address exists ONLY inside the
    // document read mid-chain (never typed by the user), and the outward send must carry
    // it REAL (rule 11 for tool-born values, through a 3-step chain).
    name: "wf-contrat-vers-email",
    prompts: [
      "Retrouve le contrat Karl Studio dans mon Drive, résume ses points clés, puis envoie ce résumé par e-mail au contact commercial indiqué dans le contrat.",
    ],
    servers: [GDRIVE, GMAIL],
    ner: NER,
    rules: { company: true },
    approveWrites: true,
    toolResult: (name) =>
      name === "google-drive__read_document"
        ? "Contrat de prestation — entre Zorvia SAS et Karl Studio, représentée par Jean Vannec. Durée : 24 mois. Montant : 48 000 € HT. Résiliation : préavis de 60 jours. Contact commercial : contact@karl-studio.fr."
        : undefined,
    secrets: ["Karl Studio", "contact@karl-studio.fr", "Jean Vannec"],
    spec: {
      sequence: [
        { tool: "google-drive__search_files" },
        { tool: "google-drive__read_document" },
        { tool: "gmail__send_email", where: { to: "karl-studio.fr" } },
      ],
      confirms: ["gmail__send_email"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "google-drive__search_files", args: { query: "contrat" } }),
      calls({ name: "google-drive__read_document", args: { fileId: "Contrat Karl Studio.docx" } }),
      (req) =>
        calls({
          name: "gmail__send_email",
          args: { to: emailIn(req), subject: "Résumé du contrat", body: "24 mois, 48 000 € HT, préavis 60 jours." },
        }),
      says("Résumé envoyé au contact commercial."),
    ],
    extraFree: (run) => {
      // The recipient the WIRE carried is the REAL address read from the document.
      const to = String(run.transcript.wireArgsOf("gmail__send_email")?.to);
      if (to !== "contact@karl-studio.fr") {
        throw new Error(`le destinataire du wire n'est pas l'adresse réelle lue dans le contrat — reçu « ${to} »`);
      }
    },
  },

  {
    // CROSS-CONNECTOR JOIN: the invoice number exists only in an e-mail; the payment
    // status only in Stripe. The model must extract from one result to query/filter the
    // other, and the ANSWER must carry the joined fact (amount).
    name: "wf-reconciliation-paiement",
    prompts: [
      "Retrouve dans mes e-mails la dernière facture envoyée, puis vérifie dans Stripe qu'elle a bien été encaissée, et dis-moi pour quel montant.",
    ],
    servers: [GMAIL, STRIPE_PAYMENTS],
    ner: NER,
    rules: { company: true },
    toolResult: (name) =>
      name === "gmail__search_messages" || name === "gmail__list_recent"
        ? "compta@zorvia.fr — « Facture INV-2093 envoyée à Karl Studio — 4 200 € » (hier)"
        : undefined,
    secrets: ["Karl Studio"],
    spec: {
      sequence: [
        { tool: /gmail__(search_messages|list_recent)/ },
        { tool: "stripe__list_payment_intents" },
      ],
      answer: (s) => /4[\s  ]?200|INV-2093/i.test(s),
    },
    mock: [
      calls({ name: "gmail__search_messages", args: { query: "facture" } }),
      calls({ name: "stripe__list_payment_intents", args: { limit: 10 } }),
      says("La facture INV-2093 a bien été encaissée : 4 200 € (paiement réussi il y a 4 jours)."),
    ],
  },

  {
    // READ → WRITE fan-out: find the blocked ticket in Linear, create the follow-up
    // task in Asana NAMING it — a tool-born identifier must survive into the write args.
    name: "wf-sprint-vers-tache",
    prompts: [
      "Fais le point du sprint dans Linear, et pour chaque ticket bloqué crée une tâche Asana « Débloquer <référence du ticket> » pour demain.",
    ],
    servers: [LINEAR, ASANA],
    approveWrites: true,
    secrets: [],
    spec: {
      sequence: [
        { tool: "linear__list_issues" },
        { tool: "asana__asana_create_task", where: { name: "NUM-229" } },
      ],
      confirms: ["asana__asana_create_task"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "linear__list_issues", args: {} }),
      calls({ name: "asana__asana_create_task", args: { name: "Débloquer NUM-229", due_on: "2026-07-25" } }),
      says("Point du sprint : 1 ticket bloqué (NUM-229) — tâche de déblocage créée pour demain."),
    ],
  },
];
