// The shipped workflow TEMPLATES (`@openmasq/ui` `routineIds` + `fillTemplate`), played as
// e2e workflows: the user picks a template in the modal, fills in its
// braces, sends — and the app runs its reality against the MCP fixtures.
//
// The prompt comes from the PRODUCT CATALOG, never a copy: rephrasing a template
// until it no longer drives its connector must break this test. That's also what
// keeps these entries from aging without anyone knowing.

import { routineIds, fillTemplate, templateServers } from "@openmasq/ui";
import type { Workflow } from "./catalog";

/** The values a user would type into each template's `{braces}`.
 *  An uncovered brace makes `fillTemplate` THROW when the module loads —
 *  a template that gains a parameter breaks the suite instead of sending "{dépôt}". */
const BLANKS: Record<string, Record<string, string>> = {
  "preparer-journee": { date: "jeudi" },
  "compte-rendu-reunions": { date: "lundi" },
  "recherche-notion": { sujet: "le pilote Karl Studio" },
  "revue-boite-mail": { période: "hier 18 h" },
  "point-hebdo-slack": { canal: "#projets", nombre: "7" },
  "point-client": { client: "Karl Studio" },
  "recherche-documents": { sujet: "le contrat Karl Studio" },
  "point-paiements": { date: "le 1er du mois" },
  "veille-sujet": { sujet: "Karl Studio", nombre: "7" },
  "revue-depot": { dépôt: "acme/app", nombre: "7" },
  "suivi-projet": { projet: "Pilote Karl Studio", date: "lundi" },
  "erreurs-semaine": { projet: "acme-app", date: "lundi" },
};

/** CONTENT hints per template — soft, checked only under `E2E_STRICT=1`
 *  (see the spec's header: a small free model's text can't be pinned). */
const HINTS: Record<string, RegExp[]> = {
  "preparer-journee": [/rendez-vous|agenda|jeudi/i],
  "compte-rendu-reunions": [/décision|action|réunion/i],
  "recherche-notion": [/page|notion|pilote/i],
  "revue-boite-mail": [/e-?mail|réponse|urgent/i],
  "point-hebdo-slack": [/canal|décision|message/i],
  "point-client": [/échange|document|attente/i],
  "recherche-documents": [/document|contrat|fichier/i],
  "point-paiements": [/paiement|encaiss|facture/i],
  "veille-sujet": [/source|rien|nouveau/i],
  "revue-depot": [/pull request|PR|issue/i],
  "suivi-projet": [/terminé|en cours|bloqué/i],
  "erreurs-semaine": [/erreur|occurrence|projet/i],
};

/**
 * ⚠️ "comparer-offres" is ABSENT, and not by oversight: it drives the
 * embedded browser, which is a real Electron window driven by CDP — not an MCP server
 * `OPENMASQ_E2E_MCP_FIXTURES` can simulate. Testing it here would mean sending
 * the suite out onto the real web, making its result depend on a third-party site. Its
 * guarantee (read-only, no click/input) is held by its `evals` scenario.
 */
// The suite plays the templates in the SOURCE language — `fillTemplate` falls back to it, and
// `BLANKS`'s `{braces}` are named in it. The IDs themselves have no language.
export const TEMPLATE_WORKFLOWS: Workflow[] = routineIds()
  .filter((id) => BLANKS[id])
  .map((id) => ({
    id: `tpl-${id}`,
    prompt: fillTemplate(id, BLANKS[id]),
    servers: templateServers(id),
    // NO shipped template writes — their copy all say so ("sends nothing",
    // "read-only", "view only"). No `write`, so the suite requires
    // that no confirmation window opens: if one starts acting, this is
    // where it shows, before the user discovers it on their real account.
    contentHints: HINTS[id] ?? [],
  }));
