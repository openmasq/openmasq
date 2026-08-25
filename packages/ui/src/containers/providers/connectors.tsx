import { createContext, useContext } from "react";

/**
 * « Ouvre la modale de CE connecteur », de n'importe où.
 *
 * Le canal seulement — aucune donnée, aucun appel hôte. L'implémentation (la modale,
 * `useMcpConnectors` et tous ses appels) vit dans `pages/Settings/mcp/`, et c'est
 * `AppShell` qui les branche l'un sur l'autre : un `containers/` ne remonte pas dans
 * `pages/` pour de la DONNÉE, mais la coquille a le droit de MONTER un écran (c'est ce
 * que fait déjà `shell/sections/`). Même montage que l'injection de `searchSettings`
 * dans `SearchModal`.
 *
 * ⚠️ `null` = aucun hôte monté (un harnais d'aperçu, un test) — pas une erreur. Comme
 * `linkOpen`, l'ABSENCE est le signal : l'appelant retombe alors sur son ancien chemin
 * (Réglages → Connecteurs) au lieu de jeter.
 */
const OpenConnectorCtx = createContext<((connectorId: string) => void) | null>(null);

export const OpenConnectorProvider = OpenConnectorCtx.Provider;

/** L'ouvreur de modale de connecteur, ou `null` si rien ne l'a monté. */
export function useOpenConnector(): ((connectorId: string) => void) | null {
  return useContext(OpenConnectorCtx);
}
