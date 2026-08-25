// Scénarios ALAMBIQUÉS — 4 à 6 connecteurs par prompt, jointures cross-connecteur,
// valeurs tool-born traversant plusieurs étages, choix ENTRE connecteurs concurrents.
// C'est la charge « assistant complet » : le modèle doit séquencer sans main tenue,
// extraire d'un résultat l'argument du suivant, et s'arrêter une fois le travail fait.

import { calls, says, type MockRequest } from "../mockModel";
import { ASANA, CRM, DEV_FLEET, directFleet, FIREFLIES, GITHUB, GMAIL, MONDAY, PAYPAL, SLACK, STRIPE_PAYMENTS } from "../servers";
import type { Scenario } from "./index";

const SENTRY = DEV_FLEET.find((s) => s.id === "sentry")!;
const TEAMS = directFleet(["microsoft-teams"])[0];

const NER = { "Karl Studio": "company", "Atelier Torbel": "company", "Jean Vannec": "name" };

/** Le premier e-mail visible dans l'inbox du modèle (un FAKE), point final exclu. */
function emailIn(req: MockRequest): string {
  for (const m of req.messages) {
    // Unicode, pas \w : le faussaire tire des prénoms français dans la partie locale
    // (léa@…, zoé@…, inès@…) et l'ASCII n'en attrapait que la queue — « a@outlook.com »,
    // dont le domaine se dé-redact ensuite seul — ou rien du tout (le repli). C'était
    // LE flake de wf2-incident-issue-comm : le salt par conversation rend le tirage du
    // prénom aléatoire, donc l'échec n'arrivait qu'un run sur quelques-uns.
    const hit = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u.exec(String(m.content ?? ""));
    if (hit) return hit[0].replace(/\.$/, "");
  }
  return "inconnu@exemple.fr";
}

export const WORKFLOW2_SCENARIOS: Scenario[] = [
  {
    // 5 CONNECTEURS, 2 écritures : fiche CRM → réunion → paiements → tâches → récap
    // par e-mail. La difficulté est l'ORCHESTRATION longue (le modèle doit tenir le
    // fil sur ~6 tours) et la synthèse finale qui croise trois sources.
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
    // SUPPORT → DEV → CLIENT : le bug n'existe que dans Slack ; l'adresse du client
    // n'existe que dans le message Slack ; l'issue et l'e-mail sont des écritures
    // dérivées de valeurs tool-born.
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
      // L'adresse envoyée est la VRAIE, apprise du message Slack (tool-born, 2 étages).
      if (String(run.transcript.wireArgsOf("gmail__send_email")?.to) !== "claire@atelier-torbel.fr") {
        throw new Error(`le destinataire du wire n'est pas l'adresse réelle signalée dans Slack — reçu « ${String(run.transcript.wireArgsOf("gmail__send_email")?.to)} »`);
      }
    },
  },

  {
    // CONNECTEURS CONCURRENTS : la facture n'est PAS dans Stripe (que INV-2093) mais
    // dans PayPal — le modèle doit chercher au bon endroit (ou pivoter après un échec)
    // puis reporter le résultat dans monday. Mesure la CONFUSION inter-outils voulue.
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
      // N'ordonner QUE la dépendance réelle (read → write) : un agent moderne dispatch
      // ses reads indépendants EN PARALLÈLE dans un même tour, l'ordre stripe/paypal
      // est donc arbitraire — un `optional` placé avant peut déplacer le curseur
      // au-delà d'un read déjà dispatché (le faux négatif mesuré sur nex).
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
    // NOUVELLE FLOTTE (transcrite + GÉNÉRÉE depuis @openmasq/connectors) : monitoring →
    // ticket → annonce d'équipe. Prouve que la couverture élargie porte une chaîne
    // read → write → write à travers trois familles de connecteurs.
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
      // Les VRAIS args du connecteur (`teamId`/`channelId`/`content`) — la fleet
      // générée rejette un mock approximatif exactement comme un modèle malformant.
      calls({
        name: "microsoft-teams__send_message",
        args: { teamId: "eq-produit", channelId: "incidents", content: "Issue #122 ouverte pour le TypeError export (Sentry)." },
      }),
      says("Erreur fréquente détectée, issue #122 ouverte et canal Incidents prévenu."),
    ],
  },
];
