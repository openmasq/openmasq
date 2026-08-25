/**
 * L'identifiant d'INSTANCE d'un serveur MCP local, dérivé de son entrée de catalogue.
 *
 * Une convention, pas une donnée : main enregistre un serveur stdio sous `local-<catalogId>`
 * (`mcp/server/lifecycle.ts`), et tout ce qui vise ce serveur — la carte des Réglages comme
 * la vue « Dossiers » de la barre de droite — doit viser le MÊME id. La recopier au jugé,
 * c'est viser un serveur qui n'existe pas : l'appel part, l'hôte répond « inconnu », et le
 * bouton a l'air de ne rien faire.
 */
export const localServerId = (catalogId: string): string => `local-${catalogId}`;

/** Le connecteur qui accorde des dossiers de cette machine. */
export const FILESYSTEM_CONNECTOR_ID = "filesystem";
