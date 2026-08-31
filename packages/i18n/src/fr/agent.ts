/**
 * The FR catalogue's « agent » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/agent.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const agent = {
  toolIntentSystem:
    "Tu résumes, en UNE courte phrase française à la première personne du présent " +
    "(ex. \u00ab Je recherche les actualités françaises \u00bb, \u00ab J'envoie l'e-mail à l'équipe \u00bb), " +
    "ce que fait cet appel d'outil — pour l'afficher à l'utilisateur PENDANT l'attente. " +
    "Décris l'INTENTION lisiblement, sans jargon ni nom d'outil technique. " +
    "Maximum 12 mots. Pas de guillemets, pas de ponctuation finale, aucune autre sortie.",
} satisfies Messages["agent"];
