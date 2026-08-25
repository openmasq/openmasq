import type { Page } from "@playwright/test";
import { EXPR_DIGEST, appel } from "./inPage";

export interface Snapshot {
  /** La section courante, telle que le rail la marque active. */
  section: string;
  /** Le titre de l'écran (`.page-header`), quand l'écran en a un. */
  titre: string | null;
  /** Le nom de la modale ouverte, s'il y en a une — elle capture les clics. */
  modale: string | null;
  /** Ce sur quoi on peut cliquer, par NOM ACCESSIBLE : le vocabulaire de `click`. */
  actions: { nom: string; role: string; n: number }[];
  /** Le composeur : ce qui est écrit, et ce que l'app annonce comme à redact. */
  composeur: { valeur: string; toRedact: string[]; envoiPret: boolean } | null;
  /** Les derniers tours de la conversation, tronqués — de quoi juger, pas de quoi noyer. */
  messages: { role: string; texte: string }[];
  /** Ce que l'écran dit et qu'aucun bouton ne porte (états vides, bannières, erreurs). */
  textes: string[];
}

/**
 * Le DIGEST d'un écran : ce qu'un utilisateur voit et peut faire, en JSON.
 *
 * Pourquoi ça existe à côté de la capture d'écran : une capture dit « c'est cassé », elle ne
 * dit pas « voici les six choses cliquables et comment les nommer ». L'agent décide sur ce
 * digest et VÉRIFIE sur la capture ; l'inverse le fait deviner des sélecteurs, et un
 * sélecteur deviné produit un faux bug — le pire déchet qu'un agent autonome puisse créer.
 *
 * Le nom retenu est le nom ACCESSIBLE (`aria-label`, sinon le texte) : le vocabulaire que
 * l'utilisateur lit, et qui casse bruyamment quand on renomme un bouton. Le code de la page
 * est une chaîne — pourquoi : `inPage.ts`.
 */
export async function snapshot(page: Page, limiteMessages = 6): Promise<Snapshot> {
  return page.evaluate(appel(EXPR_DIGEST, limiteMessages)) as Promise<Snapshot>;
}
