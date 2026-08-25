import type { RedactionRule } from "../../types";
import { SP } from "./rules.international.util";

/**
 * Royaume-Uni — les schémas de forme DISTINCTIVE, qui tirent sans mot-clé.
 *
 * Ils vivaient à même `rules.ts`, seul pays à ne pas avoir sa maison alors que la France et
 * l'Europe ont la leur (règle 2 : un concept, UNE maison). Les schémas britanniques GARDÉS
 * par un mot-clé (passeport, UTR) restent avec les autres gardés, dans
 * `rules.international.europe.ts` — c'est la nature de la garde qui range, pas le drapeau.
 *
 * ⚠️ L'ORDRE compte dans `RULES` : ce bloc se déplie exactement là où était le NINO, entre
 * les règles françaises et l'EIN américain.
 */
export const UK_RULES: RedactionRule[] = [
  // National Insurance number — 2 lettres + 6 chiffres + 1 lettre.
  //
  // ⚠️ Il s'écrit PAR PAIRES (« AB 12 34 56 C ») partout où il est IMPRIMÉ : c'est la forme
  // de gov.uk, du contrat de travail, de la fiche de paie, du P45 et du P60. La règle ne
  // connaissait que la forme COLLÉE, donc l'identifiant national d'un salarié britannique
  // partait EN CLAIR sur sa propre écriture officielle — mesuré le 17/08/2026 sur un
  // contrat de travail anglais. Même geste que les autres schémas espacés : `SP` (espace,
  // insécable, insécable fine), et rien d'autre.
  //
  // ⚠️ Pas de `WRAP` ici, à la différence des schémas à somme de contrôle : ce nombre n'en a
  // pas, donc la reprise de PRÉFIXE VALIDE (`longestValidPrefix`) n'a aucun moyen de rejeter
  // un préfixe tronqué. Mesuré : avec `WRAP` + `maxOneWrap`, une colonne « AB 12 / 34 / 56 C »
  // voyait son en-tête rogné en « AB 12\n34 », puis redacted — un faux positif créé en
  // réparant une fuite. La forme repliée reste donc NON traitée, et c'est dit.
  //
  // La précision ne bouge pas : les deux lettres de tête gardent leur classe restreinte
  // (ni D/F/I/O/Q/U/V) et la lettre de queue reste A-D — ce qu'une suite de mots ordinaire
  // n'atteint pas. `rules.uk.test.ts`.
  {
    type: "national_id",
    pattern: new RegExp(String.raw`\b[A-CEGHJ-PR-TW-Z]{2}(?:${SP}?\d{2}){3}${SP}?[A-D]\b`, "g"),
  },
];
