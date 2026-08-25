// One scenario per SHIPPED workflow template (`suggestions/routineTemplates.ts`) —
// the ideas the create modal offers. Each drives the template's REAL prompt
// (`fillTemplate`) through the real pipeline against the fixture fleet, and asserts the
// two promises the modal makes about it:
//
//   1. it drives the connectors the tag NAMES — the reported bug was a proposal that
//      swapped the ticked integration for another's, so "the idea matches its service"
//      is the invariant these tests exist for (`always: drivesItsOwnServers`);
//   2. it only READS — every template's copy says so, and a write dispatched here would
//      be the modal promising a safe routine and shipping an acting one.
//
// The ~50 GENERATED per-connector ideas get no scenario: they are one template applied
// to a catalog entry, and the property that matters (every connector answers with an
// idea scoped to itself) is a total assertion over the catalog in
// `suggestions/suggestions.test.ts` — a scenario each would be fifty copies of one test.

import { calls, says } from "../mockModel";
import { BROWSER, FIREFLIES, GCAL, GDRIVE, GMAIL, NOTION, SLACK } from "../servers";
import type { Scenario } from "./index";
import { fillTemplate, templateServers } from "../../suggestions";
import type { WorkflowRun } from "../workflow";

/** Karl Studio — the fleet's fixture theme, so the redaction has real PII to bite on. */
const NER = { "Karl Studio": "company", "Jean Vannec": "name" };

/** The template's OWN connectors are the ones that got called. Runs on mock AND live:
 *  a model that answers the right thing through the wrong service is the exact defect
 *  the reported bug produced, and only the dispatch log can see it. */
function drivesItsOwnServers(id: string) {
  return (run: WorkflowRun) => {
    const declared = templateServers(id);
    const dispatched = new Set(run.transcript.dispatched().map((n) => n.split("__")[0]));
    for (const s of declared)
      if (!dispatched.has(s))
        throw new Error(
          `« ${id} » déclare « ${s} » mais ne l'a pas appelé — appels : ${[...dispatched].join(", ") || "aucun"}`,
        );
  };
}

export const TEMPLATE_SCENARIOS: Scenario[] = [
  {
    // No account at all: the built-in browser. READ-ONLY is the template's own promise
    // (« Lis seulement : ne remplis aucun formulaire »), so the acting primitives are
    // forbidden — a model that types into a page here breaks the copy, not just a test.
    name: "tpl-comparer-offres",
    prompts: [
      fillTemplate("comparer-offres", {
        "site 1": "karl-studio.fr",
        "site 2": "atelier-torbel.fr",
        "ce que je cherche": "leurs offres d'identité visuelle",
      }),
    ],
    servers: [BROWSER],
    ner: NER,
    rules: { company: true },
    secrets: [],
    spec: {
      sequence: [{ tool: "browser__browser_navigate" }],
      forbidden: ["browser__browser_click", "browser__browser_type", "browser__browser_fill_form"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "browser__browser_navigate", args: { url: "https://karl-studio.fr" } }),
      calls({ name: "browser__browser_snapshot", args: {} }),
      calls({ name: "browser__browser_navigate", args: { url: "https://atelier-torbel.fr" } }),
      says("Comparatif : les deux proposent l'identité visuelle ; tarifs sur devis des deux côtés."),
    ],
    always: drivesItsOwnServers("comparer-offres"),
  },

  {
    // The one-click, CASA-free routine. `create_event` is forbidden: preparing a day
    // must never end up writing one (the template reads the agenda, nothing more).
    name: "tpl-preparer-journee",
    prompts: [fillTemplate("preparer-journee", { date: "jeudi 12" })],
    servers: [GCAL],
    ner: NER,
    rules: { company: true },
    secrets: [],
    spec: {
      sequence: [{ tool: "google-calendar__list_events" }],
      forbidden: ["google-calendar__create_event"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "google-calendar__list_events", args: {} }),
      says("Jeudi : point Karl Studio à 10h, revue interne à 14h. À préparer : le planning révisé."),
    ],
    always: drivesItsOwnServers("preparer-journee"),
  },

  {
    name: "tpl-compte-rendu-reunions",
    prompts: [fillTemplate("compte-rendu-reunions", { date: "lundi" })],
    servers: [FIREFLIES],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio", "Jean Vannec"],
    spec: {
      sequence: [{ tool: "fireflies__fireflies_get_transcripts" }],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "fireflies__fireflies_get_transcripts", args: { limit: 5 } }),
      calls({
        name: "fireflies__fireflies_get_transcript_details",
        args: { transcript_id: "tr-981" },
      }),
      says("Décisions : devis signé, pilote en septembre. À moi : envoyer le planning révisé."),
    ],
    always: drivesItsOwnServers("compte-rendu-reunions"),
  },

  {
    // « Ne modifie rien : lecture seule » — so `create_page` is forbidden.
    name: "tpl-recherche-notion",
    prompts: [fillTemplate("recherche-notion", { sujet: "le pilote Karl Studio" })],
    servers: [NOTION],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio"],
    spec: {
      sequence: [{ tool: "notion__search" }],
      forbidden: ["notion__create_page"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "notion__search", args: { query: "pilote" } }),
      says("Deux pages : « Pilote — cadrage » et « Compte rendu du 12 ». Le périmètre y est figé."),
    ],
    always: drivesItsOwnServers("recherche-notion"),
  },

  {
    // The « vos clés » one. Its copy ends on « N'envoie rien : montre-moi d'abord », so
    // a dispatched `send_email` is a broken promise, not a style issue.
    name: "tpl-revue-boite-mail",
    prompts: [fillTemplate("revue-boite-mail", { période: "hier 18 h" })],
    servers: [GMAIL],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio", "Jean Vannec"],
    spec: {
      sequence: [{ tool: "gmail__list_recent" }],
      forbidden: ["gmail__send_email"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "gmail__list_recent", args: {} }),
      says("Deux e-mails attendent une réponse ; le reste est informatif. Brouillons proposés ci-dessous."),
    ],
    always: drivesItsOwnServers("revue-boite-mail"),
  },

  {
    name: "tpl-point-hebdo-slack",
    prompts: [fillTemplate("point-hebdo-slack", { canal: "#projets", nombre: "7" })],
    servers: [SLACK],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio"],
    spec: {
      sequence: [{ tool: "slack__read_channel" }],
      forbidden: ["slack__send_message"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "slack__list_channels", args: {} }),
      calls({ name: "slack__read_channel", args: { channel: "#projets" } }),
      says("Décisions : livraison décalée au 20. Sans réponse : le budget print. Rien ne t'est adressé."),
    ],
    always: drivesItsOwnServers("point-hebdo-slack"),
  },

  {
    // TWO connectors — the case the reported bug mangled: the idea must drive BOTH the
    // services its tag names, not one of them plus somebody else's.
    name: "tpl-point-client",
    prompts: [fillTemplate("point-client", { client: "Karl Studio" })],
    servers: [GMAIL, GDRIVE],
    ner: NER,
    rules: { company: true },
    secrets: ["Karl Studio", "Jean Vannec"],
    spec: {
      sequence: [{ tool: "gmail__search_messages" }, { tool: "google-drive__search_files" }],
      forbidden: ["gmail__send_email"],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({ name: "gmail__search_messages", args: { query: "Karl Studio" } }),
      calls({ name: "google-drive__search_files", args: { query: "Karl Studio" } }),
      says("Derniers échanges : devis signé. Documents : le contrat de janvier. En attente de leur côté : le brief."),
    ],
    always: drivesItsOwnServers("point-client"),
  },
];
