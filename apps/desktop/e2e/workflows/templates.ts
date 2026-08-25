// Les MODÈLES de workflow livrés (`@openmasq/ui` `ROUTINE_SUGGESTIONS`), joués comme
// des workflows e2e : l'utilisateur choisit un modèle dans la modale, remplit ses
// accolades, envoie — et l'app déroule sa réalité contre les fixtures MCP.
//
// Le prompt vient du CATALOGUE PRODUIT, jamais d'une copie : reformuler un modèle
// jusqu'à ce qu'il ne pilote plus son connecteur doit casser ce test. C'est aussi ce qui
// fait que ces entrées ne peuvent pas vieillir sans qu'on le sache.

import { ROUTINE_SUGGESTIONS, fillTemplate, templateServers } from "@openmasq/ui";
import type { Workflow } from "./catalog";

/** Les valeurs qu'un utilisateur taperait dans les `{accolades}` de chaque modèle.
 *  Une accolade non couverte fait THROW `fillTemplate` au chargement du module —
 *  un modèle qui gagne un paramètre casse la suite au lieu d'envoyer « {dépôt} ». */
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

/** Indices de CONTENU par modèle — soft, vérifiés seulement sous `E2E_STRICT=1`
 *  (cf. l'en-tête du spec : le texte d'un petit modèle gratuit ne se pinne pas). */
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
 * ⚠️ « comparer-offres » est ABSENT, et pas par oubli : il pilote le navigateur
 * intégré, qui est une vraie fenêtre Electron pilotée par CDP — pas un serveur MCP que
 * `OPENMASQ_E2E_MCP_FIXTURES` peut simuler. Le tester ici reviendrait à faire sortir
 * la suite sur le vrai web, donc à rendre son résultat dépendant d'un site tiers. Sa
 * garantie (lecture seule, aucun clic/saisie) est tenue par son scénario `evals`.
 */
export const TEMPLATE_WORKFLOWS: Workflow[] = ROUTINE_SUGGESTIONS.filter(
  (t) => BLANKS[t.id],
).map((t) => ({
  id: `tpl-${t.id}`,
  prompt: fillTemplate(t.id, BLANKS[t.id]),
  servers: templateServers(t.id),
  // AUCUN modèle livré n'écrit — leur copie le dit toutes (« n'envoie rien »,
  // « lecture seule », « consultation seule »). Pas de `write`, donc la suite exige
  // qu'aucune fenêtre de confirmation ne s'ouvre : si l'une se met à agir, c'est ici
  // que ça se voit, avant que l'utilisateur ne le découvre sur son vrai compte.
  contentHints: HINTS[t.id] ?? [],
}));
