// CONVOLUTED scenarios — 4 to 6 connectors per prompt, cross-connector joins,
// tool-born values crossing several tiers, choices BETWEEN competing connectors.
// This is the "full assistant" load: the model must sequence with no hand-holding,
// extract the next argument from a result, and stop once the work is done.

import { calls, says, type MockRequest } from "../mockModel";
import { ASANA, CRM, DEV_FLEET, directFleet, FIREFLIES, GITHUB, GMAIL, MONDAY, PAYPAL, SLACK, STRIPE_PAYMENTS } from "../servers";
import type { Scenario } from "./index";

const SENTRY = DEV_FLEET.find((s) => s.id === "sentry")!;
const TEAMS = directFleet(["microsoft-teams"])[0];

const NER = { "Karl Studio": "company", "Atelier Torbel": "company", "Jean Vannec": "name" };

/** The first e-mail visible in the model's inbox (a FAKE), trailing period excluded. */
function emailIn(req: MockRequest): string {
  for (const m of req.messages) {
    // Unicode, not \w: the faker draws French first names into the local part
    // (léa@…, zoé@…, inès@…) and ASCII only caught the tail — "a@outlook.com",
    // whose domain then got un-redacted on its own — or nothing at all (the fallback). This was
    // THE flake in wf2-incident-issue-comm: the per-conversation salt makes the first-name
    // draw random, so the failure only hit one run in a few.
    const hit = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u.exec(String(m.content ?? ""));
    if (hit) return hit[0].replace(/\.$/, "");
  }
  return "inconnu@exemple.fr";
}

export const WORKFLOW2_SCENARIOS: Scenario[] = [
  {
    // 5 CONNECTORS, 2 writes: CRM record → meeting → payments → tasks → recap
    // by e-mail. The difficulty is the LONG ORCHESTRATION (the model must hold the
    // thread over ~6 turns) and the final summary that crosses three sources.
    name: "wf2-suivi-client-complet",
    prompts: [
      "Fais le point complet sur le client Karl Studio : sa fiche CRM, ce qui s'est dit à la dernière réunion, l'état de ses paiements. Crée une tâche Asana pour chaque action encore en attente, puis envoie un récapitulatif par e-mail à julien@zorvia.fr.",
    ],
    servers: [CRM, FIREFLIES, STRIPE_PAYMENTS, ASANA, GMAIL],
    ner: NER,
    rules: { company: true },
    approveWrites: true,
    secrets: ["Karl Studio", "julien@zorvia.fr"],
    spec: {
      sequence: [
        { tool: "hubspot__get_contact" },
        { tool: /fireflies__fireflies_get_transcripts|stripe__list_payment_intents/ },
        { tool: "asana__asana_create_task" },
        { tool: "gmail__send_email", where: { to: "zorvia.fr" } },
      ],
      confirms: ["asana__asana_create_task", "gmail__send_email"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "hubspot__get_contact", args: { name: "Karl Studio" } }),
      calls({ name: "fireflies__fireflies_get_transcripts", args: { limit: 3 } }),
      calls({ name: "fireflies__fireflies_get_transcript_details", args: { transcript_id: "tr-981" } }),
      calls({ name: "stripe__list_payment_intents", args: { limit: 10 } }),
      calls({ name: "asana__asana_create_task", args: { name: "Envoyer le planning révisé", due_on: "2026-07-27" } }),
      (req) =>
        calls({
          name: "gmail__send_email",
          args: { to: emailIn(req), subject: "Point client", body: "Fiche gold, pilote septembre, paiements à jour." },
        }),
      says("Point complet fait : fiche gold, pilote en septembre, paiements à jour ; 1 tâche créée, récap envoyé."),
    ],
  },

  {
    // SUPPORT → DEV → CLIENT: the bug only exists in Slack; the client's address
    // only exists in the Slack message; the issue and the e-mail are writes
    // derived from tool-born values.
    name: "wf2-incident-issue-comm",
    prompts: [
      "Lis les derniers messages du canal support Slack ; s'il y a un bug signalé, ouvre une issue GitHub dans zorvia/app qui le résume, puis envoie un e-mail au client qui l'a signalé pour lui dire que c'est pris en compte.",
    ],
    servers: [SLACK, GITHUB, GMAIL],
    approveWrites: true,
    toolResult: (name) =>
      name === "slack__read_channel"
        ? "claire (cliente, claire@atelier-torbel.fr) : l'export PDF plante depuis ce matin — erreur 500 à chaque tentative.\nmarc (support) : je remonte à l'équipe."
        : undefined,
    secrets: ["claire@atelier-torbel.fr"],
    spec: {
      sequence: [
        { tool: "slack__read_channel" },
        { tool: "github__create_issue", where: { title: /pdf|export|500/i } },
        { tool: "gmail__send_email", where: { to: "atelier-torbel.fr" } },
      ],
      confirms: ["github__create_issue", "gmail__send_email"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "slack__read_channel", args: { channel: "support" } }),
      calls({
        name: "github__create_issue",
        args: { repo: "zorvia/app", title: "Export PDF en erreur 500", body: "Signalé par une cliente ce matin." },
      }),
      (req) =>
        calls({
          name: "gmail__send_email",
          args: { to: emailIn(req), subject: "Votre signalement", body: "C'est pris en compte, correctif en cours." },
        }),
      says("Issue #122 ouverte et cliente prévenue par e-mail."),
    ],
    extraFree: (run) => {
      // The sent address is the REAL one, learned from the Slack message (tool-born, 2 tiers).
      if (String(run.transcript.wireArgsOf("gmail__send_email")?.to) !== "claire@atelier-torbel.fr") {
        throw new Error(`le destinataire du wire n'est pas l'adresse réelle signalée dans Slack — reçu « ${String(run.transcript.wireArgsOf("gmail__send_email")?.to)} »`);
      }
    },
  },

  {
    // COMPETING CONNECTORS: the invoice is NOT in Stripe (only INV-2093) but
    // in PayPal — the model must look in the right place (or pivot after a failure)
    // then report the result in monday. Measures the intended cross-tool CONFUSION.
    name: "wf2-facturation-croisee",
    prompts: [
      "Le client Atelier Torbel dit avoir réglé la facture INV-3007. Vérifie si le paiement est bien passé — côté Stripe ou côté PayPal — puis mets à jour l'item « Atelier Torbel — facturation » du board Facturation dans monday en « Payé », en notant le moyen de paiement.",
    ],
    servers: [STRIPE_PAYMENTS, PAYPAL, MONDAY],
    ner: NER,
    rules: { company: true },
    approveWrites: true,
    secrets: ["Atelier Torbel"],
    spec: {
      // Order ONLY the real dependency (read → write): a modern agent dispatches
      // its independent reads IN PARALLEL within the same turn, so the stripe/paypal
      // order is arbitrary — an `optional` placed before it can move the cursor
      // past a read already dispatched (the false negative measured on nex).
      sequence: [
        { tool: "paypal__list_transactions" },
        { tool: "monday__update_item", where: { status: /pay/i } },
      ],
      confirms: ["monday__update_item"],
      answer: (s) => /paypal/i.test(s) && /750|INV-3007/i.test(s),
    },
    mock: [
      calls({ name: "stripe__list_payment_intents", args: { limit: 10 } }),
      calls({ name: "paypal__list_transactions", args: { limit: 10 } }),
      calls({ name: "monday__get_board_items", args: { board: "Facturation" } }),
      calls({ name: "monday__update_item", args: { item_id: "4471", status: "Payé", note: "Réglée via PayPal (750 €)" } }),
      says("La facture INV-3007 a été réglée via PayPal (750 €) — l'item monday est passé en « Payé »."),
    ],
  },

  {
    // NEW FLEET (transcribed + GENERATED from @openmasq/connectors): monitoring →
    // ticket → team announcement. Proves that the widened coverage carries a
    // read → write → write chain across three connector families.
    name: "wf2-incident-monitoring",
    prompts: [
      "Regarde s'il y a une erreur fréquente dans Sentry ; si oui, ouvre une issue GitHub dans zorvia/app qui la décrit, puis préviens le canal Incidents de Teams avec le numéro de l'issue.",
    ],
    servers: [SENTRY, GITHUB, TEAMS],
    approveWrites: true,
    secrets: [],
    spec: {
      sequence: [
        { tool: "sentry__find_issues" },
        { tool: "github__create_issue", where: { title: /export|typeerror|undefined/i } },
        { tool: "microsoft-teams__send_message", where: { content: /#?12[0-9]/ } },
      ],
      confirms: ["github__create_issue", "microsoft-teams__send_message"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "sentry__find_issues", args: {} }),
      calls({
        name: "github__create_issue",
        args: { repo: "zorvia/app", title: "TypeError: export.generate is undefined", body: "41 événements, 12 utilisateurs (Sentry ZORVIA-APP-3F)." },
      }),
      // The connector's REAL args (`teamId`/`channelId`/`content`) — the generated
      // fleet rejects an approximate mock exactly like a malformed model call.
      calls({
        name: "microsoft-teams__send_message",
        args: { teamId: "eq-produit", channelId: "incidents", content: "Issue #122 ouverte pour le TypeError export (Sentry)." },
      }),
      says("Erreur fréquente détectée, issue #122 ouverte et canal Incidents prévenu."),
    ],
  },
];
