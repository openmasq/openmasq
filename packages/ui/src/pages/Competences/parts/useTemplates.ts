import { useMemo } from "react";
import { BROWSER_CONNECTOR_ID } from "@openmasq/catalog/mcp";
import { useHost } from "../../../host";
import { offeredTemplates, type AnyTemplate } from "../../../suggestions";
import { useConnectedConnectors } from "./useConnectedConnectors";
import type { Competence } from "../../../types";
import { useT } from "../../../i18n";

/**
 * Les MODÈLES DE DÉPART que la page passe à sa modale, et le repère « connecté » que le
 * sélecteur de connecteurs affiche — UNE seule requête pour les deux, sinon le classement
 * « ce qui est branché d'abord » et les points verts pourraient se contredire à l'écran.
 *
 * Sorti de `CompetencesView` quand la page a absorbé les routines : elle passait le
 * plafond de 300 lignes (règle 1), et c'est le bloc le plus autonome — il ne dépend que
 * de la liste existante et de l'hôte.
 */
export function useTemplates(competences: readonly Competence[]): {
  suggestions: AnyTemplate[];
  connected: Set<string>;
} {
  const t = useT();
  const host = useHost();
  const connected = useConnectedConnectors();
  // Le navigateur intégré s'active côté HÔTE, et ce chemin est absent sur certaines
  // plateformes (mobile, aperçu web) — même barrière que la carte du navigateur dans les
  // Réglages. Un modèle qui le nomme y partirait pour ne rien faire, en silence.
  const unavailable = useMemo(
    () => new Set(host.mcp?.enableBrowser ? [] : [BROWSER_CONNECTOR_ID]),
    [host],
  );
  // TOUS, pas les six de la bande : la modale les montre dans une colonne défilante avec
  // des chips de catégorie, et un chip qui filtrerait une liste déjà tronquée tomberait à
  // vide pour les catégories que le plafond avait écartées. Ceux que la personne a déjà
  // écrits (par le nom) sont retirés, donc la liste rétrécit quand la sienne grandit.
  const suggestions = useMemo(
    () => offeredTemplates(competences, t, { limit: 99, connected, unavailable }),
    [competences, t, connected, unavailable],
  );
  return { suggestions, connected };
}
