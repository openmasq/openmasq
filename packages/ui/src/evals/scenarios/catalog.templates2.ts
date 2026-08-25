// The rest of the shipped workflow templates — same contract as `catalog.templates.ts`
// (drives its own connectors, reads only). Split for the 300-line cap, not by theme.

import { calls, says } from "../mockModel";
import { DEV_FLEET, GDRIVE, GITHUB, LINEAR, SEARCH_FLEET, STRIPE_PAYMENTS } from "../servers";
import type { FakeServer } from "../servers";
import type { Scenario } from "./index";
import { fillTemplate, templateServers } from "../../suggestions";
import type { WorkflowRun } from "../workflow";

const NER = { "Karl Studio": "company", "Jean Vannec": "name" };

/** One connector out of a transcribed fleet, by id — a missing one is a fixture gap,
 *  not a scenario that quietly offers nothing. */
function fromFleet(fleet: FakeServer[], id: string): FakeServer {
  const s = fleet.find((x) => x.id === id);
  if (!s) throw new Error(`fixture manquante pour « ${id} » — la flotte ne le couvre pas`);
  return s;
}
const TAVILY = fromFleet(SEARCH_FLEET, "tavily");
const SENTRY = fromFleet(DEV_FLEET, "sentry");

/** Same guard as its twin file — kept local rather than shared: it is three lines, and
 *  a cross-file import between two catalog halves buys nothing. */
function drivesItsOwnServers(id: string) {
  return (run: WorkflowRun) => {
    const dispatched = new Set(run.transcript.dispatched().map((n) => n.split("__")[0]));
    for (const s of templateServers(id))
      if (!dispatched.has(s))
        throw new Error(
          `« ${id} » déclare « ${s} » mais ne l'a pas appelé — appels : ${[...dispatched].join(", ") || "aucun"}`,
        );
  };
}

export const TEMPLATE2_SCENARIOS: Scenario[] = [
  {
    name: "tpl-recherche-documents",
    prompts: [fillTemplate("recherche-documents", { sujet: "le contrat Karl Studio" })],
    servers: [GDRIVE],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio"],
    spec: {
      sequence: [{ tool: "google-drive__search_files" }],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "google-drive__search_files", args: { query: "contrat" } }),
      calls({ name: "google-drive__read_document", args: { fileId: "Contrat Karl Studio.docx" } }),
      says("Le contrat de janvier répond : 24 mois, préavis 60 jours. Rien sur la reconduction tacite."),
    ],
    always: drivesItsOwnServers("recherche-documents"),
  },

  {
    // « Consultation seule : ne crée, ne rembourse et n'annule rien » — the money one,
    // so the read-only promise is the assertion that matters most here.
    name: "tpl-point-paiements",
    prompts: [fillTemplate("point-paiements", { date: "le 1er du mois" })],
    servers: [STRIPE_PAYMENTS],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio"],
    spec: {
      sequence: [{ tool: "stripe__list_payment_intents" }],
      forbidden: ["stripe__stripe_api_write"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "stripe__list_payment_intents", args: {} }),
      says("Encaissé : 12 400 € sur la période. Un paiement échoué (carte expirée). Une facture impayée depuis 40 jours."),
    ],
    always: drivesItsOwnServers("point-paiements"),
  },

  {
    // The rule-11 one: a web search must leave with the REAL value or it answers about
    // nobody. `extraFree` reads the WIRE, not the model's view.
    name: "tpl-veille-sujet",
    prompts: [fillTemplate("veille-sujet", { sujet: "Karl Studio", nombre: "7" })],
    servers: [TAVILY],
    ner: NER,
    rules: { company: true },
    secrets: [],
    spec: {
      sequence: [{ tool: "tavily__tavily-search" }],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "tavily__tavily-search", args: { query: "Karl Studio" } }),
      says("Rien de neuf cette semaine hors leur page d'agence. Sources : karl-studio.fr."),
    ],
    always: drivesItsOwnServers("veille-sujet"),
    extraFree: (run) => {
      const q = String(run.transcript.wireArgsOf("tavily__tavily-search")?.query ?? "");
      if (!q.includes("Karl Studio"))
        throw new Error(`la recherche est partie sur un faux — requête du wire : « ${q} »`);
    },
  },

  {
    name: "tpl-revue-depot",
    prompts: [fillTemplate("revue-depot", { dépôt: "zorvia/app", nombre: "7" })],
    servers: [GITHUB],
    ner: NER,
    rules: { company: true },
    secrets: [],
    spec: {
      sequence: [{ tool: "github__list_repo_issues" }],
      forbidden: ["github__create_issue"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "github__list_repo_issues", args: { repo: "zorvia/app" } }),
      says("Trois issues actives ; deux PR attendent une revue depuis plus de quatre jours."),
    ],
    always: drivesItsOwnServers("revue-depot"),
  },

  {
    name: "tpl-suivi-projet",
    prompts: [fillTemplate("suivi-projet", { projet: "Pilote Karl Studio", date: "lundi" })],
    servers: [LINEAR],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio"],
    spec: {
      sequence: [{ tool: "linear__list_issues" }],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "linear__list_issues", args: {} }),
      says("Terminé depuis lundi : deux tickets. En cours : trois. Bloqué : l'import, en attente du client."),
    ],
    always: drivesItsOwnServers("suivi-projet"),
  },

  {
    name: "tpl-erreurs-semaine",
    prompts: [fillTemplate("erreurs-semaine", { projet: "zorvia-app", date: "lundi" })],
    servers: [SENTRY],
    ner: NER,
    rules: { company: true },
    secrets: [],
    spec: {
      sequence: [{ tool: "sentry__find_issues" }],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "sentry__find_issues", args: { project: "zorvia-app" } }),
      says("En tête : TypeError sur l'export — 41 événements, 12 utilisateurs, apparue hier."),
    ],
    always: drivesItsOwnServers("erreurs-semaine"),
  },
];
